import type { buildSelectedAllergenSummary } from "@/lib/allergens";

type Summary = ReturnType<typeof buildSelectedAllergenSummary>;

export default function MenuAllergenSummary({ summary }: { summary: Summary }) {
    const rows = [
        { label: "含む", names: summary.containsNames, className: "border-red-200 bg-red-50 text-red-800" },
        { label: "含む可能性あり・要確認", names: summary.mayContainNames, className: "border-amber-200 bg-amber-50 text-amber-900" },
        { label: "未入力・未確認", names: summary.unknownNames, className: "border-gray-300 bg-gray-50 text-gray-800" },
    ].filter((row) => row.names.length > 0);

    return (
        <div className="mt-3 space-y-3">
            <div role="group" aria-label="店舗が登録したアレルゲン">
                {rows.length > 0 ? (
                    <dl className="space-y-2">
                        {rows.map((row) => (
                            <div key={row.label} className={`rounded-lg border px-3 py-2 ${row.className}`}>
                                <dt className="text-sm font-bold leading-6">{row.label}</dt>
                                <dd className="mt-1 break-words text-base font-bold leading-7">
                                    {row.names.join("・")}
                                    <span className="ml-2 inline-block text-xs font-normal">（{row.names.length}品目）</span>
                                </dd>
                            </div>
                        ))}
                    </dl>
                ) : (
                    <p className="break-words rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-700">
                        {summary.registrationSummaryText}
                    </p>
                )}
            </div>
            {summary.storeHandledNames.length > 0 ? (
                <div role="group" aria-label="他の公開メニューの登録情報" className="rounded-lg border border-dashed border-amber-300 bg-amber-50/50 px-3 py-2">
                    <h4 className="text-xs font-bold leading-5 text-amber-900">他の公開メニューの登録情報</h4>
                    <p className="mt-1 break-words text-sm leading-6 text-amber-900">
                        <span className="font-bold">{summary.storeHandledNames.join("・")}</span>
                        ：この店舗の別の公開メニューに「含む」登録があります。
                    </p>
                </div>
            ) : null}
        </div>
    );
}
