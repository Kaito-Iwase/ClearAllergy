"use client";

import { useEffect } from "react";

const DISCARD_MESSAGE = "未保存の変更があります。保存せずにこのページを離れますか？";

// ページ内リンクと再読込を保護する。ブラウザの履歴は書き換えない。
export function useUnsavedMenuChanges(hasUnsavedChanges: boolean) {
    useEffect(() => {
        if (!hasUnsavedChanges) return;
        let allowUnload = false;
        let resetTimer: number | undefined;

        function beforeUnload(event: BeforeUnloadEvent) {
            if (allowUnload) return;
            event.preventDefault();
            event.returnValue = "";
        }

        function beforeLinkNavigation(event: MouseEvent) {
            if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
            if (!(link instanceof HTMLAnchorElement) || link.hasAttribute("download") || (link.target && link.target !== "_self")) return;
            const destination = new URL(link.href, window.location.href);
            // 外部リンクはbeforeunloadに任せ、同じページのアンカー移動はそのまま許可する。
            if (destination.origin !== window.location.origin ||
                (destination.pathname === window.location.pathname && destination.search === window.location.search)) return;
            if (!window.confirm(DISCARD_MESSAGE)) {
                event.preventDefault();
                event.stopImmediatePropagation();
                return;
            }
            // 通常のa要素でページを読み直す場合も、確認を二重に出さない。
            allowUnload = true;
            window.clearTimeout(resetTimer);
            resetTimer = window.setTimeout(() => { allowUnload = false; }, 0);
        }

        window.addEventListener("beforeunload", beforeUnload);
        document.addEventListener("click", beforeLinkNavigation, true);
        return () => {
            window.removeEventListener("beforeunload", beforeUnload);
            document.removeEventListener("click", beforeLinkNavigation, true);
            window.clearTimeout(resetTimer);
        };
    }, [hasUnsavedChanges]);

    return () => !hasUnsavedChanges || window.confirm(DISCARD_MESSAGE);
}
