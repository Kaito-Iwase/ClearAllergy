import { publicSnapshotSchema, targetKey, type PublicSnapshot, type PublicTarget } from './contracts';

export type RevalidationState = {
    displayed: PublicSnapshot;
    candidate: PublicSnapshot | null;
    phase: 'ready' | 'loading' | 'applying' | 'error';
    stale: boolean;
    error: 'request' | 'cancelled' | 'render' | null;
};

export async function readSnapshotResponse(target: PublicTarget, requestId: string, response: Pick<Response, 'status' | 'json'>): Promise<PublicSnapshot> {
    const snapshot = publicSnapshotSchema.parse(await response.json());
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
    return snapshot;
}

export async function fetchPublicSnapshot(target: PublicTarget, requestId: string, signal: AbortSignal): Promise<PublicSnapshot> {
    const query = new URLSearchParams({ kind: target.kind, requestId });
    if (target.kind !== 'list') query.set('shopId', target.shopId);
    if (target.kind === 'menu') query.set('menuId', target.menuId);
    const response = await fetch('/api/public-snapshot?' + query, {
        signal, cache: 'no-store', credentials: 'omit', headers: { Accept: 'application/json' },
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
