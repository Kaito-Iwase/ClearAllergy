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
    const [policy, setPolicy] = React.useState<'reference' | 'hide'>('reference');
    const policyRef = React.useRef<'reference' | 'hide'>('reference');
    const frame = React.useRef<number | null>(null);
    const content = React.useRef<HTMLDivElement>(null);
    const statusHeading = React.useRef<HTMLHeadingElement>(null);
    const initialId = React.useRef(initialSnapshot.requestId);
    const navigation = usePublicFreshnessNavigation();
    const wake = React.useCallback(() => {
        if (document.visibilityState !== 'visible' || window.location.pathname !== key) return;
        // Move focus before hiding the old subtree; the browser may otherwise
        // move it to body before a post-commit effect can identify the origin.
        if (policyRef.current === 'hide' && content.current?.contains(document.activeElement)) statusHeading.current?.focus();
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
    const oldContentHidden = state.stale && policy === 'hide';
    React.useEffect(() => {
        if (oldContentHidden && content.current?.contains(document.activeElement)) statusHeading.current?.focus();
    }, [oldContentHidden]);

    // A cached page must not display food for a different currently active URL.
    if (pathname !== key) return null;
    const busy = state.phase === 'loading' || state.phase === 'applying';
    const message = state.phase === 'loading' ? '公開情報を再取得しています。'
        : state.phase === 'applying' ? '取得した内容を表示に反映しています。'
            : state.phase === 'error' ? (state.error === 'cancelled' ? '再取得を中止しました。' : '再取得できませんでした。')
                : state.stale ? '再取得を待っています。' : '取得結果を画面へ反映しました。';
    return <>
        <aside aria-label="公開情報の再取得" data-public-freshness={state.phase} data-previous-information={state.stale}
            className="mx-auto my-4 max-w-5xl space-y-3 rounded-xl border-2 border-amber-500 bg-amber-50 p-4 text-gray-900">
            <p className="text-xs font-bold">旧情報の表示方法は暫定です</p>
            <h2 ref={statusHeading} tabIndex={-1} className="font-bold outline-offset-4">公開情報の取得状態</h2>
            <p role="status" aria-live="polite" className="font-bold">{message}</p>
            {state.stale && <p>表示する登録内容は以前取得した情報です。FREE（原材料に含まない）の登録も、現在の状態として再確認できていません。</p>}
            <p className="text-sm">取得開始（UTC）: <time dateTime={snapshot.startedAt}>{snapshot.startedAt}</time>。食品の確認日時や、現在の正確性を示す時刻ではありません。</p>
            <div className="flex flex-wrap gap-3">
                <button type="button" disabled={busy} onClick={() => {
                    if (frame.current !== null) cancelAnimationFrame(frame.current);
                    frame.current = null; engine.request();
                }} className="min-h-11 rounded-lg bg-green-800 px-4 py-2 font-bold text-white disabled:opacity-60">公開情報を再取得</button>
                {busy && <button type="button" onClick={() => { engine.cancel(); }} className="min-h-11 rounded-lg border border-gray-600 px-4 py-2">取得を中止</button>}
            </div>
            <details><summary className="cursor-pointer py-2 font-semibold">旧情報の表示を比較する</summary>
                <fieldset className="space-y-2"><legend>未再確認の間の表示候補</legend>
                    <label className="block"><input type="radio" name="previous-policy" checked={policy === 'reference'} onChange={() => { policyRef.current = 'reference'; setPolicy('reference'); }} /> 注意情報を残し、以前の登録として参照する</label>
                    <label className="block"><input type="radio" name="previous-policy" checked={policy === 'hide'} onChange={() => { policyRef.current = 'hide'; setPolicy('hide'); }} /> 旧情報を隠す（含有・混入の注意情報も隠れます）</label>
                </fieldset>
            </details>
            <p className="text-xs">常時最新の表示や、すべての閲覧者への訂正到達を保証するものではありません。再取得失敗は品目の登録状態を変更しません。</p>
        </aside>
        {oldContentHidden && <p role="status" className="mx-auto max-w-5xl p-4">未再確認の旧情報を隠しています。既知の含有・混入注意も表示されていません。</p>}
        <div ref={content} role="region" hidden={oldContentHidden} aria-label={state.stale ? '以前取得した公開情報' : '取得結果の公開情報'}>
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
