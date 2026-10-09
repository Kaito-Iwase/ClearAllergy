"use client";

import type { FoodReviewDraft, FoodReviewSummary } from "../food-review";
import { useId } from "react";
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

export default function MenuFoodReviewFields(props: {
    value: FoodReviewDraft; onChange: (value: FoodReviewDraft) => void;
    recording: boolean; onRecordingChange: (value: boolean) => void;
    current: boolean; foodChangeReported?: boolean; onFoodChangeReported?: (value: boolean) => void;
    history?: FoodReviewSummary[];
}) {
    const { value, onChange, recording, onRecordingChange, current } = props;
    const fieldId = useId();
    return <section className="rounded-2xl bg-white p-4 shadow-sm sm:p-5" aria-label="食品確認記録">
        <h2 className="font-bold text-gray-900">食品確認記録</h2>
        <p className="mt-2 text-sm text-gray-700">{current ? "現行の食品内容に対応する記録があります。" : "現行の食品内容の確認記録が必要です。"}</p>
        <p className="mt-2 text-sm text-gray-700">主材料、調味料・たれ・だし、付け合わせ、別添、セット構成、代替使用と仕入れ製品の仕様を、実際の提供内容と資料で照合してください。記録の存在は食品安全の保証ではありません。</p>
        {props.history?.length ? <details className="mt-3 text-sm">
            <summary className="cursor-pointer font-semibold">保存済みの確認記録（直近5件）</summary>
            <ol className="mt-2 grid gap-3">{props.history.map(review => <li key={review.id} className="rounded-lg border border-gray-200 p-3">
                <p>食品内容の版: {review.foodVersion} / 確認日時（日本時間）: {formatDateTimeJa(review.checkedAt)}</p>
                <p>記録日時（日本時間）: {formatDateTimeJa(review.recordedAt)}</p>
                <p className="whitespace-pre-wrap break-words">根拠: {review.evidenceRefs}</p>
                <p className="whitespace-pre-wrap break-words">範囲: {review.scope}</p>
                <p className="whitespace-pre-wrap break-words">未解決事項: {review.unresolvedIssues || "記録なし"}</p>
                <details className="mt-2"><summary className="cursor-pointer">この記録に対応する食品内容</summary><RecordedFoodContent value={review.contentSnapshot} /></details>
            </li>)}</ol>
        </details> : null}
        {props.onFoodChangeReported && <label className="mt-3 flex items-start gap-2 text-sm">
            <input type="checkbox" checked={props.foodChangeReported ?? false} onChange={e => props.onFoodChangeReported?.(e.target.checked)} />
            入力文字が同じでも、仕入れ仕様・代替使用・調理工程などの食品変更があった
        </label>}
        <label className="mt-3 flex items-start gap-2 text-sm">
            <input type="checkbox" checked={recording} onChange={e => onRecordingChange(e.target.checked)} />今回の提供内容と原資料を照合した記録を保存する
        </label>
        {recording && <div className="mt-3 grid gap-3">
            <div className="grid gap-1 text-sm"><label htmlFor={`${fieldId}-evidence`}>根拠資料・製品識別・資料の版</label>
                <textarea id={`${fieldId}-evidence`} required maxLength={4000} rows={3} value={value.evidenceRefs} onChange={e => onChange({ ...value, evidenceRefs: e.target.value })} className="rounded-lg border border-gray-300 p-2" />
            </div>
            <div className="grid gap-1 text-sm"><label htmlFor={`${fieldId}-scope`}>確認した提供内容・バリエーション・構成品・対象アレルゲンの範囲</label>
                <textarea id={`${fieldId}-scope`} required maxLength={2000} rows={3} value={value.scope} onChange={e => onChange({ ...value, scope: e.target.value })} className="rounded-lg border border-gray-300 p-2" />
            </div>
            <div className="grid gap-1 text-sm"><label htmlFor={`${fieldId}-checked`}>食品根拠を確認した日時</label>
                <input id={`${fieldId}-checked`} required type="datetime-local" value={value.checkedAt ? value.checkedAt.slice(0, 16) : ""} onChange={e => onChange({ ...value, checkedAt: e.target.value })} className="rounded-lg border border-gray-300 p-2" />
            </div>
            <div className="grid gap-1 text-sm"><label htmlFor={`${fieldId}-issues`}>未解決事項（残っている場合は公開できません）</label>
                <textarea id={`${fieldId}-issues`} maxLength={2000} rows={2} value={value.unresolvedIssues} onChange={e => onChange({ ...value, unresolvedIssues: e.target.value })} className="rounded-lg border border-gray-300 p-2" />
            </div>
        </div>}
    </section>;
}
