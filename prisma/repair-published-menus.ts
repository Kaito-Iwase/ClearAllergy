import { PrismaClient } from "@prisma/client";
import { createStatusBySlug, getMenuPublishValidationErrors } from "../lib/allergens";

const prisma = new PrismaClient();

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

        const statusBySlug = createStatusBySlug(allergens, menu.allergenLinks);
        const publishErrors = menu.isPublished
            ? getMenuPublishValidationErrors({
                  name: menu.name,
                  ingredients: menu.ingredients,
                  precaution: menu.precaution,
                  allergens,
                  statusBySlug,
              })
            : [];

        if (missingAllergens.length > 0 || publishErrors.length > 0) {
            await prisma.$transaction(async (tx) => {
                if (missingAllergens.length > 0) {
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
