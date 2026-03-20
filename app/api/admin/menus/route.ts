import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { internalError, readJson, requireShopId } from "@/app/api/admin/_utils";
import {
    parsePriceYen,
    toBooleanOrDefault,
    toRequiredTrimmedString,
    toTrimmedNullableString,
} from "@/lib/admin-validators";
import {
    ALLERGEN_STATUS_VALUES,
    type AllergenStatus,
} from "@/lib/allergens";

// リクエスト body の型
type MenuCreateBody = {
    name?: unknown;
    description?: unknown;
    priceYen?: unknown;
    category?: unknown;
    ingredients?: unknown;
    precaution?: unknown;
    isPublished?: unknown;
    imageUrl?: unknown;
    allergenStatusBySlug?: unknown;
};

// GET /api/admin/menus ・・・ 一覧（管理用）
export async function GET() {
    try {
        const auth = await requireShopId();
        if (!auth.ok) {
            return auth.res;
        }

        const menus = await prisma.menuItem.findMany({
            where: { shopId: auth.shopId },
            orderBy: { updatedAt: "desc" },
            select: {
                id: true,
                name: true,
                priceYen: true,
                category: true,
                imageUrl: true,
                isPublished: true,
                updatedAt: true,
            },
        });

        return NextResponse.json({ menus });
    } catch (e) {
        return internalError(e);
    }
}

// POST /api/admin/menus ・・・ 新規作成（下書き作成対応）
export async function POST(req: Request) {
    try {
        const auth = await requireShopId();
        if (!auth.ok) {
            return auth.res;
        }

        const body = await readJson<MenuCreateBody>(req);

        // body が無くても仮タイトルで下書きを作れるようにする
        const name = toRequiredTrimmedString(body?.name) ?? "新しいメニュー";

        const priceResult = parsePriceYen(body?.priceYen);
        if (!priceResult.ok) {
            return NextResponse.json(
                { error: priceResult.message },
                { status: 400 },
            );
        }

        const description = toTrimmedNullableString(body?.description);
        const category = toTrimmedNullableString(body?.category);
        const ingredients = toTrimmedNullableString(body?.ingredients);
        const precaution = toTrimmedNullableString(body?.precaution);
        const imageUrl = toTrimmedNullableString(body?.imageUrl);
        const allergenStatusBySlug = body?.allergenStatusBySlug;

        // 新規作成時は基本下書き
        const isPublished = toBooleanOrDefault(body?.isPublished, false);
        let allergenMap: Record<string, AllergenStatus> = {};

        if (allergenStatusBySlug !== undefined) {
            if (
                typeof allergenStatusBySlug !== "object" ||
                allergenStatusBySlug === null ||
                Array.isArray(allergenStatusBySlug)
            ) {
                return NextResponse.json(
                    { error: "allergenStatusBySlug must be an object" },
                    { status: 400 },
                );
            }

            allergenMap = Object.fromEntries(
                Object.entries(
                    allergenStatusBySlug as Record<string, unknown>,
                ).map(([slug, status]) => {
                    if (
                        typeof status !== "string" ||
                        !ALLERGEN_STATUS_VALUES.includes(
                            status as AllergenStatus,
                        )
                    ) {
                        throw new Error(`invalid allergen status: ${slug}`);
                    }

                    return [slug, status as AllergenStatus];
                }),
            );
        }

        const slugs = Object.keys(allergenMap);
        const allergens =
            slugs.length > 0
                ? await prisma.allergen.findMany({
                      where: { slug: { in: slugs } },
                      select: { id: true, slug: true },
                  })
                : [];

        if (slugs.length > 0) {
            const found = new Set(allergens.map((allergen) => allergen.slug));
            const missing = slugs.filter((slug) => !found.has(slug));

            if (missing.length > 0) {
                return NextResponse.json(
                    { error: "unknown allergen slug(s)", missing },
                    { status: 400 },
                );
            }
        }

        const created = await prisma.$transaction(async (tx) => {
            const menu = await tx.menuItem.create({
                data: {
                    shopId: auth.shopId,
                    name,
                    description,
                    priceYen: priceResult.value,
                    category,
                    ingredients,
                    precaution,
                    isPublished,
                    imageUrl,
                },
                select: {
                    id: true,
                },
            });

            if (allergens.length > 0) {
                await tx.menuItemAllergen.createMany({
                    data: allergens.map((allergen) => ({
                        menuItemId: menu.id,
                        allergenId: allergen.id,
                        status: allergenMap[allergen.slug] ?? "FREE",
                    })),
                });
            }

            return menu;
        });

        return NextResponse.json({ id: created.id }, { status: 201 });
    } catch (e) {
        if (
            e instanceof Error &&
            e.message.startsWith("invalid allergen status:")
        ) {
            return NextResponse.json({ error: e.message }, { status: 400 });
        }
        return internalError(e);
    }
}
