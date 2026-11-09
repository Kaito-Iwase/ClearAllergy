import { parseStoredImagePath } from '@/lib/storage/stored-image-path';
import { publicMenuImageSchema, publicSnapshotSchema, shopViewSnapshotSchema, SHOP_VIEW_MEDIA_TYPE, targetKey,
    type PublicSnapshot, type PublicTarget, type PublicViewSnapshot, type PublicMenuImages } from './contracts';

export type RevalidationState = {
    displayed: PublicViewSnapshot;
    candidate: PublicViewSnapshot | null;
    phase: 'ready' | 'loading' | 'applying' | 'error';
    stale: boolean;
    error: 'request' | 'cancelled' | 'render' | null;
};

export async function readSnapshotResponse(target: PublicTarget, requestId: string,
    response: Pick<Response, 'status' | 'json'> & { headers?: Headers },
): Promise<PublicViewSnapshot> {
    const body: unknown = await response.json();
    const isShopView = target.kind === 'shop' && response.headers?.get('content-type')?.split(';', 1)[0] === SHOP_VIEW_MEDIA_TYPE;
    const view = isShopView ? shopViewSnapshotSchema.parse(body) : undefined;
    const snapshot = view
        ? { version: view.version, targetKey: view.targetKey, requestId: view.requestId, startedAt: view.startedAt, result: view.result }
        : publicSnapshotSchema.parse(body);
    if (snapshot.requestId !== requestId || snapshot.targetKey !== targetKey(target)) throw Error('Snapshot correlation mismatch');
    const result = snapshot.result;
    if (result.kind === 'unavailable') throw Error('Public read unavailable');
    if (result.kind === 'not-found') {
        if (response.status !== 404 || target.kind === 'list') throw Error('Invalid terminal result');
    } else {
        if (response.status !== 200 || result.kind !== target.kind) throw Error('Invalid visible result');
        if (result.kind === 'shop' && target.kind === 'shop' && result.data.shop.id !== target.shopId) throw Error('Wrong shop');
        if (result.kind === 'menu' && target.kind === 'menu' && result.data.shopId !== target.shopId) throw Error('Wrong shop');
    }
    if (result.kind !== 'shop' || !view?.menuImages || typeof view.menuImages !== 'object') return snapshot;
    const rawImages = view.menuImages as Record<string, unknown>;
    const menuImages: PublicMenuImages = Object.fromEntries(result.data.menusForClient.flatMap(menu => {
        if (!Object.hasOwn(rawImages, menu.id)) return [];
        const image = publicMenuImageSchema.safeParse(rawImages[menu.id]);
        if (!image.success || image.data.updatedAt !== menu.updatedAt) return [];
        const url = parseStoredImagePath(image.data.safeImageUrl, { kind: 'menu', shopId: result.data.shop.id });
        return url ? [[menu.id, { ...image.data, safeImageUrl: url.href }]] : [];
    }));
    return { ...snapshot, menuImages };
}

export async function fetchPublicSnapshot(target: PublicTarget, requestId: string, signal: AbortSignal): Promise<PublicViewSnapshot> {
    const query = new URLSearchParams({ kind: target.kind, requestId });
    if (target.kind !== 'list') query.set('shopId', target.shopId);
    if (target.kind === 'menu') query.set('menuId', target.menuId);
    const response = await fetch('/api/public-snapshot?' + query, {
        // Keep the browser's existing same-origin deployment-protection session.
        // Public loaders remain anonymous and never personalize the snapshot.
        signal, cache: 'no-store', credentials: 'same-origin',
        headers: { Accept: target.kind === 'shop' ? SHOP_VIEW_MEDIA_TYPE : 'application/json' },
    });
    return readSnapshotResponse(target, requestId, response);
}

type Fetcher = typeof fetchPublicSnapshot;

// Request completion and DOM application are distinct. A result becomes the
// committed snapshot only after every required content part reports a commit.
export function createPublicRevalidator(target: PublicTarget, initial: PublicSnapshot, fetcher: Fetcher = fetchPublicSnapshot) {
    let state: RevalidationState = {
        displayed: initial, candidate: initial.result.kind === 'unavailable' ? null : initial,
        phase: initial.result.kind === 'unavailable' ? 'error' : 'applying',
        stale: true, error: initial.result.kind === 'unavailable' ? 'request' : null,
    };
    const listeners = new Set<() => void>();
    let sequence = 0;
    let active: AbortController | null = null;
    let pendingResume = false;
    let connected = true;
    let interrupted = false;
    const emit = (next: RevalidationState) => { state = next; listeners.forEach(listener => listener()); };

    function request() {
        if (!connected) return;
        if (active || state.candidate) { pendingResume = true; return; }
        const generation = ++sequence;
        const controller = new AbortController();
        active = controller;
        const requestId = crypto.randomUUID();
        emit({ ...state, phase: 'loading', stale: true, error: null });
        void fetcher(target, requestId, controller.signal).then(snapshot => {
            if (!connected || generation !== sequence) return;
            active = null;
            // A resume after this request began needs a later snapshot. Do not
            // briefly announce the earlier result as a completed revalidation.
            if (pendingResume) { pendingResume = false; request(); return; }
            emit({ ...state, candidate: snapshot, phase: 'applying', stale: true, error: null });
        }, () => {
            if (!connected || generation !== sequence) return;
            active = null;
            if (pendingResume) { pendingResume = false; request(); return; }
            emit({ ...state, candidate: null, phase: 'error', stale: true, error: 'request' });
        });
    }

    return {
        getState: () => state,
        subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
        request,
        // The caller coalesces idle focus/visibility/pageshow events within one
        // animation frame. Events during a request become one pending followup.
        noteResume() {
            if (active || state.candidate) pendingResume = true;
            emit({ ...state, stale: true });
            return !active && !state.candidate;
        },
        applied(requestId: string) {
            if (state.candidate?.requestId !== requestId) return;
            const displayed = state.candidate;
            emit({ displayed, candidate: null, phase: 'ready', stale: pendingResume, error: null });
            if (pendingResume) { pendingResume = false; request(); }
        },
        renderFailed(requestId: string) {
            if (state.candidate?.requestId !== requestId) return;
            pendingResume = false;
            emit({ ...state, candidate: null, phase: 'error', stale: true, error: 'render' });
        },
        cancel() {
            ++sequence; active?.abort(); active = null; pendingResume = false;
            emit({ ...state, candidate: null, phase: 'error', stale: true, error: 'cancelled' });
        },
        connect() { connected = true; if (interrupted || (state.stale && state.phase === 'ready')) { interrupted = false; request(); } },
        disconnect() {
            connected = false; ++sequence; interrupted = Boolean(active); active?.abort(); active = null; pendingResume = false;
        },
    };
}
