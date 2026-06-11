import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import {
    ALLERGEN_MASTER,
    PISTACHIO_ALLERGEN,
} from "../lib/constants/allergen-master";
import {
    buildRecommendedIngredientNotice,
    buildSpecifiedIngredientNotice,
    RECOMMENDED_INGREDIENT_SLUGS,
    SPECIFIED_INGREDIENT_SLUGS,
} from "../lib/allergens";

loadEnvConfig(process.cwd());

const prisma = new PrismaClient();

function fail(message: string): never {
    throw new Error(message);
}

async function main() {
    const pistachioDefinition = PISTACHIO_ALLERGEN;

    if (!pistachioDefinition) {
        fail("Pistachio is missing from ALLERGEN_MASTER.");
    }

    if (ALLERGEN_MASTER.length !== 29) {
        fail(`ALLERGEN_MASTER must contain 29 items, got ${ALLERGEN_MASTER.length}.`);
    }

    const slugs = ALLERGEN_MASTER.map((allergen) => allergen.slug);
    const duplicateSlugs = slugs.filter(
        (slug, index) => slugs.indexOf(slug) !== index,
    );

    if (duplicateSlugs.length > 0) {
        fail(`Duplicate allergen slug(s): ${duplicateSlugs.join(", ")}`);
    }

    if (SPECIFIED_INGREDIENT_SLUGS.length !== 9) {
        fail(
            `SPECIFIED_INGREDIENT_SLUGS must contain 9 items, got ${SPECIFIED_INGREDIENT_SLUGS.length}.`,
        );
    }

    if (RECOMMENDED_INGREDIENT_SLUGS.length !== 20) {
        fail(
            `RECOMMENDED_INGREDIENT_SLUGS must contain 20 items, got ${RECOMMENDED_INGREDIENT_SLUGS.length}.`,
        );
    }

    const classifiedSlugs: string[] = [
        ...SPECIFIED_INGREDIENT_SLUGS,
        ...RECOMMENDED_INGREDIENT_SLUGS,
    ];
    const duplicateClassifiedSlugs = classifiedSlugs.filter(
        (slug, index) => classifiedSlugs.indexOf(slug) !== index,
    );

    if (duplicateClassifiedSlugs.length > 0) {
        fail(
            `Allergen classifications overlap: ${duplicateClassifiedSlugs.join(", ")}`,
        );
    }

    const unclassifiedSlugs = slugs.filter(
        (slug) => !classifiedSlugs.includes(slug),
    );
    const unknownClassifiedSlugs = classifiedSlugs.filter(
        (slug) => !slugs.includes(slug),
    );

    if (unclassifiedSlugs.length > 0 || unknownClassifiedSlugs.length > 0) {
        fail(
            `Allergen classifications must cover ALLERGEN_MASTER exactly: unclassified=${unclassifiedSlugs.join(", ") || "none"}, unknown=${unknownClassifiedSlugs.join(", ") || "none"}`,
        );
    }

    if (!SPECIFIED_INGREDIENT_SLUGS.includes("cashew")) {
        fail("Cashew must be classified as a specified ingredient.");
    }

    if (
        SPECIFIED_INGREDIENT_SLUGS.includes(
            "pistachio" as (typeof SPECIFIED_INGREDIENT_SLUGS)[number],
        )
    ) {
        fail("Pistachio must not be classified as a specified ingredient.");
    }

    if (!RECOMMENDED_INGREDIENT_SLUGS.includes("pistachio")) {
        fail("Pistachio must be classified as a recommended ingredient.");
    }

    const classificationTestRows = ALLERGEN_MASTER.map((allergen) => ({
        slug: allergen.slug,
        nameJa: allergen.nameJa,
        status:
            allergen.slug === "cashew"
                ? ("CONTAINS" as const)
                : allergen.slug === "pistachio"
                  ? ("UNKNOWN" as const)
                  : ("FREE" as const),
    }));
    const specifiedNotice = buildSpecifiedIngredientNotice({
        rows: classificationTestRows,
    });
    const recommendedNotice = buildRecommendedIngredientNotice({
        rows: classificationTestRows,
    });

    if (
        specifiedNotice.kind !== "danger" ||
        !specifiedNotice.resultText.includes("カシューナッツ") ||
        specifiedNotice.resultText.includes("ピスタチオ")
    ) {
        fail(
            "Specified ingredient notice must include cashew and exclude pistachio.",
        );
    }

    if (
        recommendedNotice.kind !== "unknown" ||
        !recommendedNotice.resultText.includes("ピスタチオ")
    ) {
        fail("Recommended ingredient notice must show pistachio as unknown.");
    }

    const cashew = ALLERGEN_MASTER.find((allergen) => allergen.slug === "cashew");
    if (
        !cashew ||
        cashew.nameJa !== "カシューナッツ" ||
        cashew.nameEn !== "Cashew" ||
        cashew.sortOrder !== 14
    ) {
        fail("Cashew master definition was changed unexpectedly.");
    }

    const dbAllergens = await prisma.allergen.findMany({
        orderBy: { sortOrder: "asc" },
        select: {
            id: true,
            slug: true,
            nameJa: true,
            nameEn: true,
            sortOrder: true,
        },
    });

    if (dbAllergens.length !== 29) {
        fail(`DB Allergen must contain 29 rows, got ${dbAllergens.length}.`);
    }

    for (const expected of ALLERGEN_MASTER) {
        const actual = dbAllergens.find(
            (allergen) => allergen.slug === expected.slug,
        );

        if (!actual) {
            fail(`DB Allergen is missing slug: ${expected.slug}`);
        }

        if (
            actual.nameJa !== expected.nameJa ||
            actual.nameEn !== expected.nameEn ||
            actual.sortOrder !== expected.sortOrder
        ) {
            fail(
                `DB Allergen mismatch for ${expected.slug}: expected ${JSON.stringify(
                    expected,
                )}, got ${JSON.stringify(actual)}`,
            );
        }
    }

    const pistachio = dbAllergens.find(
        (allergen) => allergen.slug === pistachioDefinition.slug,
    );

    if (!pistachio) {
        fail("DB Allergen is missing pistachio.");
    }

    const [menuCount, pistachioLinkCount] = await Promise.all([
        prisma.menuItem.count(),
        prisma.menuItemAllergen.count({
            where: { allergenId: pistachio.id },
        }),
    ]);

    if (pistachioLinkCount !== menuCount) {
        fail(
            `Pistachio MenuItemAllergen rows must match MenuItem count: menus=${menuCount}, pistachioRows=${pistachioLinkCount}.`,
        );
    }

    const pistachioStatusCounts = await prisma.menuItemAllergen.groupBy({
        by: ["status"],
        where: { allergenId: pistachio.id },
        _count: {
            status: true,
        },
    });

    console.log("Allergen master check passed.");
    console.log(
        `Allergen classifications: specified=${SPECIFIED_INGREDIENT_SLUGS.length}, recommended=${RECOMMENDED_INGREDIENT_SLUGS.length}`,
    );
    console.log(`DB allergens: ${dbAllergens.length}`);
    console.log(`Menu items: ${menuCount}`);
    console.log(`Pistachio menu rows: ${pistachioLinkCount}`);
    console.log(
        `Pistachio statuses: ${pistachioStatusCounts
            .map((row) => `${row.status}=${row._count.status}`)
            .join(", ")}`,
    );
}

main()
    .catch((error) => {
        console.error(error);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
