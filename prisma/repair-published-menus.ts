import { PrismaClient } from "@prisma/client";
import { createStatusBySlug, getMenuPublishValidationErrors } from "../lib/allergens";

const prisma = new PrismaClient();

// このスクリプトは、本番反映時に 1 回だけ実行する既存データ是正用です。
// 過去データには 29 品目の欠損や、不完全なのに公開中のメニューがあり得るため、
// ここで UNKNOWN 補完と公開解除をまとめて行います。
async function main() {
    const allergens = await prisma.allergen.findMany({
        orderBy: { sortOrder: "asc" },
        select: { id: true, slug: true, nameJa: true },
    });

    const menus = await prisma.menuItem.findMany({
        select: {
            id: true,
            name: true,
            ingredients: true,
            precaution: true,
            isPublished: true,
            allergenLinks: {
                select: {
                    allergenId: true,
                    status: true,
                    allergen: {
                        select: { slug: true },
                    },
                },
            },
        },
    });

    let filledMissingRows = 0;
    let unpublishedMenus = 0;

    for (const menu of menus) {
        const existingAllergenIds = new Set(
            menu.allergenLinks.map((link) => link.allergenId),
        );
        const missingAllergens = allergens.filter(
            (allergen) => !existingAllergenIds.has(allergen.id),
        );

        // 既存リンクが一部しか無い場合でも、公開判定は 29 品目そろった前提で見たいので
        // まず UNKNOWN 補完つきの状態マップを作ります。
        const statusBySlug = createStatusBySlug(allergens, menu.allergenLinks);
        const publishErrors = menu.isPublished
            ? getMenuPublishValidationErrors({
                  name: menu.name,
                  allergens,
                  statusBySlug,
              })
            : [];

        if (missingAllergens.length > 0 || publishErrors.length > 0) {
            await prisma.$transaction(async (tx) => {
                if (missingAllergens.length > 0) {
                    // 欠けている行は UNKNOWN で埋めます。
                    // ここで FREE にしないのは、未確認なのに「含まない」と誤解されるのを防ぐためです。
                    filledMissingRows += missingAllergens.length;
                    await tx.menuItemAllergen.createMany({
                        data: missingAllergens.map((allergen) => ({
                            menuItemId: menu.id,
                            allergenId: allergen.id,
                            status: "UNKNOWN" as never,
                        })),
                    });
                }

                if (publishErrors.length > 0) {
                    // 条件を満たさない公開メニューは、事故防止のため下書きへ戻します。
                    unpublishedMenus += 1;
                    await tx.menuItem.update({
                        where: { id: menu.id },
                        data: { isPublished: false },
                    });
                }
            });
        }
    }

    console.log(`menus checked: ${menus.length}`);
    console.log(`missing allergen rows filled: ${filledMissingRows}`);
    console.log(`published menus forced to draft: ${unpublishedMenus}`);
}

main()
    .catch((error) => {
        console.error(error);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
