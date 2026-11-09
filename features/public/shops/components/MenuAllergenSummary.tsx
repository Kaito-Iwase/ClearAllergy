"use client";

import { Fragment } from "react";
import type { buildSelectedAllergenSummary } from "@/lib/allergens";
import { usePreviousPublicInformation } from "../freshness/presentation";

type Summary = ReturnType<typeof buildSelectedAllergenSummary>;

export default function MenuAllergenSummary({
    id,
    summary,
    highlightedSlugs,
}: {
    id: string;
    summary: Summary;
    highlightedSlugs?: ReadonlySet<string>;
}) {
    const previous = usePreviousPublicInformation();
    const rows = [
        { label: "含む", names: summary.containsNames, slugs: summary.slugs.containsSlugs, className: "border-red-300 bg-red-50 text-red-900" },
        { label: "含む可能性あり・要確認", names: summary.mayContainNames, slugs: summary.slugs.mayContainSlugs, className: "border-amber-300 bg-amber-50 text-amber-950" },
        { label: "未入力・未確認", names: summary.unknownNames, slugs: summary.slugs.unknownSlugs, className: "border-gray-300 bg-gray-50 text-gray-800" },
    ].filter((row) => row.names.length > 0);

    function renderNames(names: string[], slugs: string[]) {
        return names.map((name, index) => (
            <Fragment key={slugs[index]}>
                {index > 0 && "・"}
                <span>{name}{highlightedSlugs?.has(slugs[index]) && <>
                    <span aria-hidden="true" className="ml-0.5 font-bold">※</span>
                    <span className="sr-only">（注目設定に一致）</span>
                </>}</span>
            </Fragment>
        ));
    }

    return (
        <div className="mt-2 space-y-2">
            {previous && <p id={`${id}-previous`} className="text-xs font-semibold text-amber-900">以前取得した登録内容・現在は未再確認</p>}
            <div role="group" aria-label="店舗が登録したアレルゲン">
                {rows.length > 0 ? (
                    <dl id={id} className="space-y-2">
                        {rows.map((row) => (
                            <div key={row.label} className={`rounded-r-md border-l-2 px-3 py-1.5 ${row.className}`}>
                                <dt className="text-sm font-bold leading-6">{row.label}</dt>
                                <dd className="wrap-anywhere text-base font-semibold leading-7">
                                    {renderNames(row.names, row.slugs)}
                                    <span className="ml-2 inline-block text-sm font-normal">（{row.names.length}品目）</span>
                                </dd>
                            </div>
                        ))}
                    </dl>
                ) : (
                    <p id={id} className="wrap-anywhere text-sm leading-6 text-slate-700">
                        {previous ? "未再確認のため、条件に合うかの要約は表示していません。" : summary.registrationSummaryText}
                    </p>
                )}
            </div>
            {summary.storeHandledNames.length > 0 ? (
                <div role="group" aria-label="他の公開メニューの登録情報" className="rounded-md border border-dashed border-gray-300 bg-gray-50 px-3 py-2">
                    <h4 className="text-sm font-bold leading-6 text-gray-900">別メニューに含む</h4>
                    <p id={`${id}-supplement`} className="wrap-anywhere text-sm leading-6 text-gray-800">
                        <span className="font-semibold">{renderNames(summary.storeHandledNames, summary.slugs.storeHandledSlugs)}</span>
                        ：同じ店舗の別の公開メニューに、この品目を含む登録があります。
                    </p>
                    <p className="text-sm leading-6 text-gray-700">当該メニューの原材料登録とは別の情報です。</p>
                </div>
            ) : null}
        </div>
    );
}
