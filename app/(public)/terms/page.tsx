import Link from "next/link";

export const metadata = {
    title: "利用規約 | ClearAllergy",
};

export const dynamic = "force-static";

const LAST_UPDATED = "2026年4月22日";

const sections = [
    {
        title: "ポートフォリオ公開版について",
        body: "ClearAllergy は現在、サービス内容や画面の使い心地を確認していただくためのポートフォリオ公開版として公開しています。実際の店舗運用サービスとしての一般提供は、今後調整予定です。",
    },
    {
        title: "掲載情報の扱い",
        body: "掲載されている店舗情報、メニュー情報、アレルゲン情報には、閲覧体験や UI 確認のためのサンプル情報が含まれる場合があります。内容の正確性、最新性、完全性を保証するものではなく、予告なく変更、追加、削除されることがあります。",
    },
    {
        title: "アレルゲン情報の確認",
        body: "アレルゲン情報は外食前の確認をしやすくするための参考情報です。実際に利用する際は、必ず店舗へ直接確認してください。仕入れ、調理環境、レシピ変更などにより、表示内容と実際の内容が異なる場合があります。",
    },
    {
        title: "責任範囲",
        body: "ClearAllergy の表示内容は、食の安全性やアレルギー対応を保証するものではありません。アレルギー症状や健康に関わる判断は、利用者ご自身で店舗・医療機関などへ確認したうえで行ってください。",
    },
    {
        title: "登録・編集機能について",
        body: "現在、新規登録や店舗情報の編集機能はデモ用途を中心に公開しています。一般ユーザーが実店舗の情報を自由に登録・編集できる状態での公開は、今後の運用方針に合わせて調整します。",
    },
    {
        title: "お問い合わせ",
        body: "掲載内容の確認、削除依頼、不具合報告、その他のお問い合わせは、制作者の GitHub プロフィールまたは ClearAllergy リポジトリの Issue など、公開している連絡手段からご連絡ください。",
    },
    {
        title: "内容の変更について",
        body: "このページの内容や ClearAllergy の機能は、開発状況や公開方針に応じて変更することがあります。変更後の内容は、このページなどで確認できるようにします。",
    },
];

export default function TermsPage() {
    return (
        <main className="bg-[#f6f8f6] px-5 py-12 text-[#111811] sm:px-6 lg:py-16">
            <div className="mx-auto max-w-[860px]">
                <div className="mb-8">
                    <p className="text-sm font-bold text-green-800">
                        ClearAllergy
                    </p>
                    <h1 className="mt-2 text-3xl font-black tracking-tight text-neutral-900 sm:text-4xl">
                        利用規約
                    </h1>
                    <p className="mt-4 text-sm leading-7 text-neutral-600 sm:text-base">
                        このページでは、ClearAllergy
                        のポートフォリオ公開版をご覧いただくうえで知っておいてほしいことをまとめています。
                    </p>
                    <p className="mt-2 text-sm font-semibold text-neutral-600">
                        最終更新日: {LAST_UPDATED}
                    </p>
                </div>

                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm leading-7 text-amber-950 sm:px-6">
                    このサイトは現在デモ用に公開しています。掲載内容を確認する際は、実際の利用前に店舗へ直接ご確認ください。
                </div>

                <div className="mt-6 space-y-4">
                    {sections.map((section) => (
                        <section
                            key={section.title}
                            className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm sm:p-6"
                        >
                            <h2 className="text-lg font-bold text-neutral-900">
                                {section.title}
                            </h2>
                            <p className="mt-3 text-sm leading-7 text-neutral-600 sm:text-base sm:leading-8">
                                {section.body}
                            </p>
                        </section>
                    ))}
                </div>

                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                    <Link
                        href="/"
                        className="inline-flex h-12 items-center justify-center rounded-lg bg-[#13ec13] px-6 text-sm font-bold text-neutral-900 shadow-lg shadow-[#13ec13]/20 transition hover:bg-[#0db80d]"
                    >
                        トップページへ戻る
                    </Link>
                    <Link
                        href="/shops"
                        className="inline-flex h-12 items-center justify-center rounded-lg border border-neutral-200 bg-white px-6 text-sm font-bold text-neutral-900 transition hover:bg-neutral-50"
                    >
                        店舗一覧を見る
                    </Link>
                </div>
            </div>
        </main>
    );
}
