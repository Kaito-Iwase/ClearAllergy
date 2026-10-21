import type { getMenuSavePlan } from "../menu-save-plan";

const reviewLabels = {
    incomplete: "今回の記録の根拠・範囲・確認日時を見直してください。",
    unresolved: "今回の記録に未解決事項があるため、保存後も非公開です。",
    recording: "今回入力した確認記録を、保存する食品内容に結び付けます。",
    changed: "食品内容の変更があります。新しい確認記録がないため、保存後は再確認が必要です。",
    current: "食品内容の変更はなく、保存済みの現行記録を使用します。価格・画像の構図だけの変更では確認を失効させません。",
    required: "現行の食品内容に対応する確認記録が必要です。",
};

export default function MenuSaveOutcomeNotice({ plan, unknownCount, totalCount }: {
    plan: ReturnType<typeof getMenuSavePlan>; unknownCount: number; totalCount: number;
}) {
    return <section aria-label="保存後の予定" className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-800">
        <h2 className="font-bold">保存後の予定：{plan.willPublish ? "公開" : "非公開"}</h2>
        <dl className="mt-2 grid gap-2">
            <div><dt className="font-semibold">品目入力</dt><dd>{unknownCount ? `未設定 ${unknownCount}件` : `${totalCount}品目の入力済み`}</dd></div>
            <div><dt className="font-semibold">食品確認</dt><dd>{reviewLabels[plan.foodReviewState]}</dd></div>
        </dl>
        {plan.publishErrors.length > 0 && <p className="mt-2">公開条件：{plan.publishErrors.join(" ")}</p>}
        {plan.reviewInputInvalid && <p className="mt-2 font-semibold">確認記録の入力を修正するまで保存できません。確認日時は現在より5分を超える未来には指定できません。</p>}
        <p className="mt-2 text-xs leading-5">入力内容からの予定です。確定した公開状態と食品確認は、保存後の結果で確認してください。</p>
    </section>;
}
