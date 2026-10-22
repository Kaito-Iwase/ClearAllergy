"use client";

import type { FoodReviewSummary } from "../food-review";
import { ALLERGEN_STATUS_VALUES, statusLabelJa, type AllergenStatus } from "@/lib/allergens";
import { formatDateTimeJa } from "@/lib/utils/formatters";

function RecordedFoodContent({ value }: { value: unknown }) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return <p>記録の形式を確認できません。保存元を確認してください。</p>;
    const content = value as Record<string, unknown>;
    const fields = { name: "食品名", description: "説明", category: "カテゴリ", ingredients: "原材料", precaution: "注意書き", imageUrl: "食品画像" };
    return <div className="mt-2 grid gap-2">
        <dl className="grid gap-2">{Object.entries(fields).map(([key, label]) => <div key={key}>
            <dt className="font-semibold">{label}</dt><dd className="whitespace-pre-wrap break-words">{typeof content[key] === "string" ? content[key] as string : "記録なし"}</dd>
        </div>)}</dl>
        <p className="font-semibold">当時の品目別登録</p>
        <ul className="grid gap-1 sm:grid-cols-2">{Array.isArray(content.allergens) ? content.allergens.map((row: unknown, index) => {
            if (!row || typeof row !== "object" || Array.isArray(row)) return <li key={index}>記録の形式を確認できません</li>;
            const item = row as Record<string, unknown>;
            const status = typeof item.status === "string" && ALLERGEN_STATUS_VALUES.includes(item.status as AllergenStatus) ? item.status as AllergenStatus : "UNKNOWN";
            return <li key={index}>{typeof item.nameJa === "string" ? item.nameJa : "品目未確認"}：{statusLabelJa(status)}</li>;
        }) : <li>品目別記録を確認できません</li>}</ul>
    </div>;
}

export default function MenuFoodReviewHistory({ history }: { history: FoodReviewSummary[] }) {
    if (!history.length) return null;
    return <section aria-label="以前の食品確認記録" className="mt-4 text-sm">
        <p>以前の食品確認記録は履歴として保持しています。公開操作とは別の記録です。</p>
        {history?.length ? <details className="mt-3 text-sm">
            <summary className="cursor-pointer font-semibold">保存済みの確認記録（直近5件）</summary>
            <ol className="mt-2 grid gap-3">{history.map(review => <li key={review.id} className="rounded-lg border border-gray-200 p-3">
                <p>食品内容の版: {review.foodVersion} / 確認日時（日本時間）: {formatDateTimeJa(review.checkedAt)}</p>
                <p>記録日時（日本時間）: {formatDateTimeJa(review.recordedAt)}</p>
                <p className="whitespace-pre-wrap break-words">根拠: {review.evidenceRefs}</p>
                <p className="whitespace-pre-wrap break-words">範囲: {review.scope}</p>
                <p className="whitespace-pre-wrap break-words">当時の未解決事項: {review.unresolvedIssues || "記録なし"}</p>
                {review.issueResolutions?.map(resolution => <p key={resolution.foodVersion}>解消の操作記録：食品版 {resolution.foodVersion} / {formatDateTimeJa(resolution.resolvedAt)}（日本時間）。食品安全の保証ではありません。</p>)}
                <details className="mt-2"><summary className="cursor-pointer">この記録に対応する食品内容</summary><RecordedFoodContent value={review.contentSnapshot} /></details>
            </li>)}</ol>
        </details> : null}
    </section>;
}
