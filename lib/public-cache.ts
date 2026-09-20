import { revalidatePath } from "next/cache";

export function revalidatePublicShopPaths(shopId: string) {
    revalidatePath("/shops");
    revalidatePath(`/shops/${shopId}`);
}

export function revalidatePublicMenuPaths(shopId: string, menuId: string) {
    revalidatePublicShopPaths(shopId);
    revalidatePath(`/shops/${shopId}/menus/${menuId}`);
    // 別メニューの公開登録から得る補足も更新対象にする。次回閲覧時に再生成する。
    revalidatePath("/(public)/shops/[shopId]/menus/[menuId]", "page");
}
