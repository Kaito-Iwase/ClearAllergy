import { revalidatePath } from "next/cache";

export function revalidatePublicShopPaths(shopId: string) {
    revalidatePath("/shops");
    revalidatePath(`/shops/${shopId}`);
}

export function revalidatePublicMenuPaths(shopId: string, menuId: string) {
    revalidatePublicShopPaths(shopId);
    revalidatePath(`/shops/${shopId}/menus/${menuId}`);
}
