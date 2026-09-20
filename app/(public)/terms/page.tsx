import { PROTOTYPE_NOTICE } from "@/lib/public-prototype";
import Link from "next/link";

export const metadata = {
    title: "利用規約 | ClearAllergy",
};

export const dynamic = "force-static";

const LAST_UPDATED = "2026年9月5日";

const sections = [
    {
        title: "ポートフォリオ公開版について",
        body: "ClearAllergyは、架空店舗・架空メニューを用いてアレルゲン情報のUI・情報設計を検証する実運用前のプロトタイプです。",
    },
    {
        title: "掲載情報の扱い",
        body: "掲載する店舗情報、メニュー情報、アレルゲン情報は、閲覧体験やUI確認のための架空情報です。内容の正確性、最新性、完全性を保証するものではなく、予告なく変更、追加、削除されることがあります。",
    },
    {
        title: "アレルゲン情報の確認",
        body: "「原材料に含まない登録」は食品安全の保証ではありません。「含む可能性あり・要確認」は、含む可能性があり確認が必要な状態です。他の公開メニューから得た補足は厨房での確認結果ではありません。",
    },
    {
        title: "責任範囲",
        body: "表示内容は食品の安全性や摂取可否を判定・保証するものではありません。実際の飲食判断には使用しないでください。",
    },
    {
        title: "登録・編集機能について",
        body: "現在、店舗情報の登録・編集機能は招待を受けた管理者向けに限定しています。一般ユーザーや未招待の店舗が自由に登録・編集できる状態では公開していません。",
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
                    {PROTOTYPE_NOTICE}
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
