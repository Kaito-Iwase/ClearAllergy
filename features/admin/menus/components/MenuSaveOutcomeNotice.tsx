import type { getMenuSavePlan } from "../menu-save-plan";

const reviewLabels = {
    unresolved: "保存済みの未解決事項があるため、公開できません。",
    changed: "食品内容を変更すると非公開になります。保存済み内容を見直して、別に「公開する」を操作してください。",
    current: "保存済みの食品内容の公開状態を維持します。価格・画像の構図だけの変更では公開を停止しません。",
    required: "非公開で保存します。保存済み内容を見直して「公開する」を操作できます。",
};

export default function MenuSaveOutcomeNotice({ plan, unknownCount, totalCount }: {
    plan: ReturnType<typeof getMenuSavePlan>; unknownCount: number; totalCount: number;
}) {
    return <section aria-label="保存後の予定" className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-800">
        <h2 className="font-bold">保存後の予定：{plan.willPublish ? "公開" : "非公開"}</h2>
        <dl className="mt-2 grid gap-2">
            <div><dt className="font-semibold">品目入力</dt><dd>{unknownCount ? `未設定 ${unknownCount}件` : `${totalCount}品目の入力済み`}</dd></div>
            <div><dt className="font-semibold">公開操作</dt><dd>{reviewLabels[plan.publicationState]}</dd></div>
        </dl>
        {plan.publishErrors.length > 0 && <p className="mt-2">公開条件：{plan.publishErrors.join(" ")}</p>}
        <p className="mt-2 text-xs leading-5">確定した公開状態は保存後の結果で確認してください。公開操作は食品安全の保証や資料の照合記録ではありません。</p>
    </section>;
}
