"use client";

export default function GlobalError({ reset }: { reset: () => void }) {
    return (
        <html lang="ja">
            <body>
                <main>
                    <h1>画面を読み込めませんでした</h1>
                    <p role="alert">しばらくしてから再度お試しください。</p>
                    <button type="button" onClick={reset}>再試行する</button>
                </main>
            </body>
        </html>
    );
}
