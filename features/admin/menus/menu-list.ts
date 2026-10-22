import { hasUnresolvedFoodIssue } from "./food-review";
import { isMenuPublicationCurrent } from "@/lib/allergens";

export type MenuFoodReviewState = "current" | "unresolved" | "outdated" | "missing";

export type AdminMenuListRow = {
    id: string;
    name: string;
    category: string | null;
    priceYen: number | null;
    imageUrl: string | null;
    isPublished: boolean;
    version: number;
    updatedAt: string;
    unknownAllergenNames: string[];
    foodReviewState: MenuFoodReviewState;
};

// DBが維持する公開の版対応と、保持した食品確認履歴の未解決状態を一覧向けに説明する。
// 停止フラグや経過日数から失効理由を推測しない。
export function getMenuFoodReviewState(menu: {
    foodVersion: number;
    reviewedFoodVersion: number | null;
    publicationConfirmedFoodVersion?: number | null;
    foodReviews: ReadonlyArray<{ foodVersion: number; unresolvedIssues: string | null; issueResolutions?: ReadonlyArray<{ foodVersion: number }> }>;
}): MenuFoodReviewState {
    const latest = menu.foodReviews[0];
    if (hasUnresolvedFoodIssue(menu.foodVersion, latest)) return "unresolved";
    if (isMenuPublicationCurrent(menu)) return "current";
    if (!latest) return "missing";
    return "outdated";
}

export const menuFoodReviewText: Record<MenuFoodReviewState, { label: string; reason: string }> = {
    current: { label: "食品内容の版対応あり", reason: "保存済みの食品内容と公開の版が対応しています。食品安全の保証ではありません。" },
    unresolved: { label: "未解決事項あり", reason: "最新の食品確認記録に未解決事項があります。編集画面で内容を確認し、実際に対応してから別の「この内容は解消した」を操作してください。" },
    outdated: { label: "公開前：保存済み内容の確認待ち", reason: "以前の記録は流用しません。保存済み内容を見直して「公開する」を操作してください。" },
    missing: { label: "公開前：保存済み内容の確認待ち", reason: "保存済み内容を見直して「公開する」を操作してください。長文の食品確認フォームは不要です。" },
};
