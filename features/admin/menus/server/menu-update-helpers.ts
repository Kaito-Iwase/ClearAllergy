import type { AllergenStatus } from "@/lib/allergens";

export type MenuMutationAuditAction =
    | "menu_update"
    | "menu_publish"
    | "menu_unpublish";

export function getMenuMutationAuditAction(
    wasPublished: boolean,
    isPublished: boolean,
): MenuMutationAuditAction {
    if (wasPublished === isPublished) {
        return "menu_update";
    }

    return isPublished ? "menu_publish" : "menu_unpublish";
}

/**
 * 現行マスタにある品目だけを、既存の状態表へ上書きします。
 * 不明な slug の拒否は呼び出し元で先に行い、この関数から状態表を拡張しません。
 */
export function mergeIncomingAllergenStatuses(args: {
    allergens: Array<{ slug: string }>;
    currentStatusBySlug: Record<string, AllergenStatus>;
    incomingStatusBySlug: Record<string, AllergenStatus>;
}): Record<string, AllergenStatus> {
    const mergedStatusBySlug = { ...args.currentStatusBySlug };

    for (const allergen of args.allergens) {
        const incomingStatus = args.incomingStatusBySlug[allergen.slug];
        if (incomingStatus) {
            mergedStatusBySlug[allergen.slug] = incomingStatus;
        }
    }

    return mergedStatusBySlug;
}
