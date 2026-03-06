// app/(admin)/admin/menus/[menuId]/edit/page.tsx
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import MenuEditClient from "./MenuEditClient"; // ←あなたのClient名に合わせて

type Status = "CONTAINS" | "FREE" | "MAY_CONTAIN";

interface MenuEditClientProps {
    params: {
        menuId: string;
        shopId: string;
        initialName: string;
        initialIsPublished: boolean;
        allergens: Array<{
            slug: string;
            nameJa: string;
            nameEn: string;
            sortOrder: number;
        }>;
        initialStatusBySlug: Record<string, Status>;
    };
}

export default async function AdminMenuEditPage({
    params,
}: {
    params: MenuEditClientProps["params"];
}) {
    // 1) ログイン必須
    const session = await getServerSession(authOptions);
    if (!session?.user) redirect("/admin/login");

    // 2) 店舗ID（権限チェックに使う）
    const shopId = session.user.shopId;
    if (!shopId) redirect("/admin/login");

    // 3) 編集対象menuId
    const menuId = params.menuId;

    // 4) メニュー本体（この店舗のものだけ）
    const menu = await prisma.menuItem.findFirst({
        where: { id: menuId, shopId },
        select: {
            id: true,
            shopId: true,
            name: true,
            isPublished: true,
            // 必要なら他の基本情報もここで取る（description等）
            allergenLinks: {
                select: {
                    status: true,
                    allergen: { select: { slug: true } },
                },
            },
        },
    });

    // 5) 無ければ戻す
    if (!menu) redirect("/admin/menus");

    // 6) 28品目マスタ（表示順固定）
    const allergens = await prisma.allergen.findMany({
        orderBy: [{ sortOrder: "asc" }, { nameJa: "asc" }],
        select: { slug: true, nameJa: true, nameEn: true, sortOrder: true },
    });

    // 7) 初期状態（まず全部FREEで埋める）
    const initialStatusBySlug: Record<string, Status> = {};
    for (const a of allergens) initialStatusBySlug[a.slug] = "FREE";

    // 8) 既存登録があれば上書き
    for (const link of menu.allergenLinks) {
        initialStatusBySlug[link.allergen.slug] = link.status;
    }

    // 9) Clientへ渡す（アレルゲン編集に必要な材料＋公開ボタンに必要な材料）
    return (
        <MenuEditClient
            params={{
                menuId: menu.id,
                shopId: menu.shopId,
                initialName: menu.name,
                initialIsPublished: menu.isPublished,
                allergens: allergens,
                initialStatusBySlug: initialStatusBySlug,
            }}
        />
    );
}
