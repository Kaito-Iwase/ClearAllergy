"use client";

import { useLayoutEffect, useRef } from "react";

export default function TestEnvironmentBanner() {
    const ref = useRef<HTMLElement>(null);
    useLayoutEffect(() => {
        const element = ref.current;
        if (!element) return;
        const root = document.body;
        const update = () => root.style.setProperty("--test-preview-banner-height", `${element.getBoundingClientRect().height}px`);
        update();
        const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(update);
        observer?.observe(element);
        window.addEventListener("resize", update);
        return () => {
            observer?.disconnect();
            window.removeEventListener("resize", update);
            root.style.removeProperty("--test-preview-banner-height");
        };
    }, []);

    return (
        <aside ref={ref} aria-label="テスト環境の案内" className="test-environment-banner">
            <strong>テスト環境・架空データ</strong>
            <span>実店舗の情報ではありません。</span>
        </aside>
    );
}
