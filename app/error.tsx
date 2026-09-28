"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
    return (
        <main className="mx-auto max-w-2xl space-y-4 px-4 py-12">
            <h1 className="text-2xl font-bold">画面を読み込めませんでした</h1>
            <p role="alert">しばらくしてから再度お試しください。問題が続く場合は、時間をおいてアクセスしてください。</p>
            <button type="button" onClick={reset} className="rounded-lg border border-gray-400 px-4 py-2 font-bold focus-visible:outline-2 focus-visible:outline-offset-4">
                再試行する
            </button>
        </main>
    );
}
