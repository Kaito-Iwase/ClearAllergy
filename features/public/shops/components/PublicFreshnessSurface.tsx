"use client";

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import PublicShopListClient from './PublicShopListClient';
import PublicShopDetailView from './PublicShopDetailView';
import PublicMenuDetailView from './PublicMenuDetailView';
import { usePublicFreshnessNavigation } from './PublicFreshnessNavigation';
import { targetKey, type PublicMenuImages, type PublicSnapshot, type PublicTarget } from '../freshness/contracts';
import { createPublicRevalidator } from '../freshness/revalidation';
import { PreviousPublicInformation, PublicApplyProof, usePreviousPublicInformation, usePublicApplyProof } from '../freshness/presentation';

type Props = { target: PublicTarget; initialSnapshot: PublicSnapshot; menuImages?: PublicMenuImages };

function Terminal({ unavailable }: { unavailable: boolean }) {
    const previous = usePreviousPublicInformation();
    const heading = React.useRef<HTMLHeadingElement>(null);
    usePublicApplyProof('terminal');
    React.useEffect(() => { if (!unavailable && !previous) heading.current?.focus(); }, [unavailable, previous]);
    return <main className="mx-auto max-w-4xl space-y-3 px-4 py-8">
        <h1 ref={heading} tabIndex={-1} className="text-xl font-bold outline-offset-4">{unavailable ? '公開情報を読み込めません' : 'この公開情報は現在表示できません'}</h1>
        <p>{unavailable ? '再取得をお試しください。' : '対象がないか、公開条件を満たしていません。以前の食品内容は表示しません。'}</p>
        <Link href="/shops" className="underline">店舗一覧へ戻る</Link>
    </main>;
}

function SnapshotView({ snapshot, menuImages }: { snapshot: PublicSnapshot; menuImages?: PublicMenuImages }) {
    const result = snapshot.result;
    if (result.kind === 'list') return <PublicShopListClient {...result.data} />;
    if (result.kind === 'shop') return <PublicShopDetailView {...result.data} menuImages={menuImages} />;
    if (result.kind === 'menu') return <PublicMenuDetailView {...result.data} />;
    return <Terminal unavailable={result.kind === 'unavailable'} />;
}

class ViewBoundary extends React.Component<{ token: string; failed: (token: string) => void; children: React.ReactNode }, { error: boolean; token: string }> {
    state = { error: false, token: this.props.token };
    static getDerivedStateFromProps(props: { token: string }, state: { token: string }) {
        return props.token !== state.token ? { error: false, token: props.token } : null;
    }
    static getDerivedStateFromError() { return { error: true }; }
    componentDidCatch() { this.props.failed(this.props.token); }
    render() { return this.state.error ? <p role="alert" className="p-4">取得した内容を表示できません。再取得をお試しください。</p> : this.props.children; }
}

function Surface({ target, initialSnapshot, menuImages }: Props) {
    const key = targetKey(target);
    const pathname = usePathname();
    const [engine] = React.useState(() => createPublicRevalidator(target, initialSnapshot));
    const state = React.useSyncExternalStore(engine.subscribe, engine.getState, engine.getState);
    const snapshot = state.candidate ?? state.displayed;
    const showMenuImages = !state.stale || state.candidate?.requestId === initialSnapshot.requestId;
    const currentMenuImages = !showMenuImages ? undefined
        : snapshot.requestId === initialSnapshot.requestId ? menuImages : snapshot.menuImages;
    const frame = React.useRef<number | null>(null);
    const content = React.useRef<HTMLDivElement>(null);
    const initialId = React.useRef(initialSnapshot.requestId);
    const navigation = usePublicFreshnessNavigation();
    const wake = React.useCallback(() => {
        if (document.visibilityState !== 'visible' || window.location.pathname !== key) return;
        if (engine.noteResume() && frame.current === null) {
            frame.current = requestAnimationFrame(() => { frame.current = null; engine.request(); });
        }
    }, [engine, key]);

    React.useEffect(() => {
        engine.connect();
        const visible = () => { if (document.visibilityState === 'visible') wake(); };
        const restored = (event: PageTransitionEvent) => { if (event.persisted) wake(); };
        window.addEventListener('focus', wake);
        document.addEventListener('visibilitychange', visible);
        window.addEventListener('pageshow', restored);
        return () => {
            window.removeEventListener('focus', wake);
            document.removeEventListener('visibilitychange', visible);
            window.removeEventListener('pageshow', restored);
            if (frame.current !== null) cancelAnimationFrame(frame.current);
            frame.current = null;
            engine.disconnect();
        };
    }, [engine, wake]);
    React.useEffect(() => { if (navigation?.consume(key)) wake(); }, [navigation, key, wake]);
    React.useEffect(() => {
        if (initialId.current !== initialSnapshot.requestId) { initialId.current = initialSnapshot.requestId; wake(); }
    }, [initialSnapshot.requestId, wake]);

    const proof = React.useMemo(() => {
        const required = snapshot.result.kind === 'shop' ? ['shop-menus', 'shop-summary']
            : snapshot.result.kind === 'menu' ? ['menu'] : snapshot.result.kind === 'list' ? ['list'] : ['terminal'];
        const seen = new Set<string>();
        return { token: snapshot.requestId, report: (part: string, token: string) => {
            if (token !== snapshot.requestId || !required.includes(part)) return;
            seen.add(part);
            if (required.every(item => seen.has(item))) engine.applied(token);
        } };
    }, [engine, snapshot.requestId, snapshot.result.kind]);
    const failed = React.useCallback((token: string) => engine.renderFailed(token), [engine]);

    // A cached page must not display food for a different currently active URL.
    if (pathname !== key) return null;
    // The initial server snapshot has no previous result to warn about.
    const applyingInitialSnapshot = state.phase === 'applying' && snapshot.requestId === state.displayed.requestId;
    const showNotice = state.stale && !applyingInitialSnapshot;
    const busy = state.phase === 'loading' || state.phase === 'applying';
    const message = state.phase === 'loading' ? '公開情報を再取得しています。'
        : state.phase === 'applying' ? '取得した内容を表示に反映しています。'
            : state.phase === 'error' ? (state.error === 'cancelled' ? '再取得を中止しました。' : '再取得できませんでした。')
                : '再取得を待っています。';
    const hasPreviousInformation = snapshot.result.kind !== 'unavailable' && snapshot.result.kind !== 'not-found';
    return <>
        {showNotice && <aside aria-label="公開情報の再取得" className="mx-auto max-w-5xl space-y-1 px-4 py-2 text-sm text-gray-900">
            <p role={state.phase === 'error' ? 'alert' : 'status'} className="font-semibold">{message}</p>
            {hasPreviousInformation && <p>表示する登録内容は以前取得した情報です。FREE（原材料に含まない）の登録も、現在の状態として再確認できていません。</p>}
            {(busy || state.phase === 'error') && <button key={busy ? 'cancel' : 'retry'} type="button" onClick={() => {
                content.current?.focus();
                if (busy) {
                    engine.cancel();
                    return;
                }
                if (frame.current !== null) cancelAnimationFrame(frame.current);
                frame.current = null;
                engine.request();
            }} className="min-h-11 underline">{busy ? '取得を中止' : '公開情報を再取得'}</button>}
        </aside>}
        <div ref={content} role="region" tabIndex={-1} aria-label={state.stale ? '以前取得した公開情報' : '取得結果の公開情報'}
            data-public-freshness={state.phase} data-previous-information={state.stale}>
            <PreviousPublicInformation.Provider value={state.stale}>
                <PublicApplyProof.Provider value={proof}>
                    <ViewBoundary token={snapshot.requestId} failed={failed}>
                        <SnapshotView snapshot={snapshot} menuImages={currentMenuImages} />
                    </ViewBoundary>
                </PublicApplyProof.Provider>
            </PreviousPublicInformation.Provider>
        </div>
    </>;
}

export default function PublicFreshnessSurface(props: Props) {
    return <Surface key={targetKey(props.target)} {...props} />;
}
