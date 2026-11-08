import { NextResponse } from 'next/server';
import { z } from 'zod';
import { publicSnapshotSchema, SHOP_VIEW_MEDIA_TYPE, targetKey, type PublicTarget } from '@/features/public/shops/freshness/contracts';
import { loadPublicShopList } from '@/features/public/shops/server/public-shop-list-data';
import { loadPublicShopDetail, loadPublicShopDetailPageData } from '@/features/public/shops/server/public-shop-detail-data';
import { loadPublicMenuDetail } from '@/features/public/shops/server/public-menu-detail-data';
import { logOperationalError } from '@/lib/observability';

export const dynamic = 'force-dynamic';
const id = z.string().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/);
const request = z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('list'), requestId: z.string().uuid() }).strict(),
    z.object({ kind: z.literal('shop'), shopId: id, requestId: z.string().uuid() }).strict(),
    z.object({ kind: z.literal('menu'), shopId: id, menuId: id, requestId: z.string().uuid() }).strict(),
]);

export async function GET(req: Request) {
    const params = new URL(req.url).searchParams;
    if ([...new Set(params.keys())].some(key => params.getAll(key).length !== 1)) {
        return NextResponse.json({ error: 'invalid request' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
    }
    const parsed = request.safeParse(Object.fromEntries(params));
    if (!parsed.success) return NextResponse.json({ error: 'invalid request' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
    const { requestId, ...target } = parsed.data;
    const startedAt = new Date().toISOString();
    const headers = { 'Cache-Control': 'no-store', ...(target.kind === 'shop' && { Vary: 'Accept' }) };
    try {
        // Only the storefront opts in. The registration and images come from
        // one RepeatableRead, including when updatedAt happens to be reused.
        const view = target.kind === 'shop' && req.headers.get('Accept') === SHOP_VIEW_MEDIA_TYPE
            ? await loadPublicShopDetailPageData(target.shopId) : undefined;
        const result = view?.result ?? (target.kind === 'list' ? await loadPublicShopList()
            : target.kind === 'shop' ? await loadPublicShopDetail(target.shopId)
                : await loadPublicMenuDetail(target.shopId, target.menuId));
        const snapshot = publicSnapshotSchema.parse({ version: 1, targetKey: targetKey(target), requestId, startedAt, result });
        return NextResponse.json(view ? { ...snapshot, menuImages: view.menuImages ?? {} } : snapshot, {
            status: result.kind === 'not-found' ? 404 : result.kind === 'unavailable' ? 503 : 200,
            headers: view ? { ...headers, 'Content-Type': SHOP_VIEW_MEDIA_TYPE } : headers,
        });
    } catch (error) {
        logOperationalError(error, { operation: 'public_snapshot_read' });
        return NextResponse.json({ version: 1, targetKey: targetKey(target as PublicTarget), requestId, startedAt,
            result: { kind: 'unavailable' } }, { status: 503, headers });
    }
}
