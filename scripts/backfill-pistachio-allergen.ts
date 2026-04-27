import { loadEnvConfig } from "@next/env";
import { AllergenStatus, PrismaClient } from "@prisma/client";
import { PISTACHIO_ALLERGEN } from "../lib/allergen-master";

loadEnvConfig(process.cwd());

const prisma = new PrismaClient();

async function main() {
    const pistachioDefinition = PISTACHIO_ALLERGEN;

    if (!pistachioDefinition) {
        throw new Error("Pistachio allergen definition is missing.");
    }

    const allergen = await prisma.allergen.upsert({
        where: { slug: pistachioDefinition.slug },
        update: {
            nameJa: pistachioDefinition.nameJa,
            nameEn: pistachioDefinition.nameEn,
            sortOrder: pistachioDefinition.sortOrder,
        },
        create: pistachioDefinition,
        select: { id: true, slug: true, nameJa: true, sortOrder: true },
    });

    const insertedRows = await prisma.$executeRaw`
        INSERT INTO "MenuItemAllergen" ("menuItemId", "allergenId", "status", "createdAt", "updatedAt")
        SELECT
            "MenuItem"."id",
            ${allergen.id},
            ${AllergenStatus.UNKNOWN}::"AllergenStatus",
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP
        FROM "MenuItem"
        ON CONFLICT ("menuItemId", "allergenId") DO NOTHING
    `;

    const [allergenCount, menuCount, pistachioLinkCount] = await Promise.all([
        prisma.allergen.count(),
        prisma.menuItem.count(),
        prisma.menuItemAllergen.count({
            where: { allergenId: allergen.id },
        }),
    ]);

    console.log(
        `pistachio allergen ensured: ${allergen.slug} (${allergen.nameJa}) sortOrder=${allergen.sortOrder}`,
    );
    console.log(`pistachio menu rows inserted: ${insertedRows}`);
    console.log(`allergen master count: ${allergenCount}`);
    console.log(`menu count: ${menuCount}`);
    console.log(`pistachio menu row count: ${pistachioLinkCount}`);
}

main()
    .catch((error) => {
        console.error(error);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
