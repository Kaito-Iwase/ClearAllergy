import { randomUUID } from "node:crypto";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import PublicFreshnessSurface from "@/features/public/shops/components/PublicFreshnessSurface";
import { loadPublicShopDetailPageData } from "./public-shop-detail-data";
import { targetKey, type PublicTarget, type PublicSnapshot } from "@/features/public/shops/freshness/contracts";

export const dynamic = "force-dynamic";

export default async function PublicShopDetailPage({ params }: { params: Promise<{ shopId: string }> }) {
    const startedAt = new Date().toISOString();
    const requestId = randomUUID();
    const { shopId } = await params;
    if (!shopId) notFound();
    const target: PublicTarget = { kind: "shop", shopId };
    const { result, menuImages } = await loadPublicShopDetailPageData(shopId);
    if (result.kind === "not-found") notFound();
    const initialSnapshot: PublicSnapshot = {
        version: 1, targetKey: targetKey(target), requestId, startedAt, result,
    };

    return (
        <Suspense fallback={<main className="mx-auto max-w-5xl px-4 py-8"><p role="status">公開情報を読み込み中です。</p></main>}>
            <PublicFreshnessSurface target={target} initialSnapshot={initialSnapshot} menuImages={menuImages} />
        </Suspense>
    );
}
