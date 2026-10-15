import { isFoodReviewCurrent } from "@/lib/allergens";

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

// 公開判定は変更せず、DBが維持する確認対応と最新記録を一覧向けに説明する。
// 停止フラグや経過日数から失効理由を推測しない。
export function getMenuFoodReviewState(menu: {
    foodVersion: number;
    reviewedFoodVersion: number | null;
    foodReviews: ReadonlyArray<{ foodVersion: number; unresolvedIssues: string | null }>;
}): MenuFoodReviewState {
    const latest = menu.foodReviews[0];
    if (!latest) return "missing";
    if (latest.foodVersion !== menu.foodVersion) return "outdated";
    if (latest.unresolvedIssues?.trim()) return "unresolved";
    if (isFoodReviewCurrent(menu)) return "current";
    return "outdated";
}

export const menuFoodReviewText: Record<MenuFoodReviewState, { label: string; reason: string }> = {
    current: { label: "現行の食品確認記録あり", reason: "現在の食品内容に対応する確認記録があります。公開状態・品目設定とは別に表示しています。" },
    unresolved: { label: "食品確認：再確認待ち", reason: "最新の食品確認記録に未解決事項があります。編集画面で内容を確認してください。" },
    outdated: { label: "食品確認：再確認待ち", reason: "現在の食品内容に対応する確認記録がありません。以前の記録は編集画面で確認してください。" },
    missing: { label: "食品確認：再確認待ち", reason: "食品確認記録がありません。編集画面で根拠・範囲・確認日時を記録してください。" },
};
