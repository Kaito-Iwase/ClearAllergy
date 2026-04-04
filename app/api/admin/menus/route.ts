// このファイルは管理画面のメニュー一覧取得と新規作成 API です。
// /api/admin/menus の GET は一覧、POST は新規作成を担当します。
// どちらも requireShopId() を通し、ログイン中の店舗だけを対象にします。

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

// request.json() の結果は unknown に近いので、まず期待する形を宣言しておきます。
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

// GET は保存済みメニュー一覧の取得です。
// 管理画面トップで表示するため、必要な列だけ絞って返します。
export async function GET() {
    try {
        // 認証済みかつ shopId を持つ管理者だけに絞ります。
        const auth = await requireShopId();
        if (!auth.ok) {
            return auth.res;
        }

        // shopId で絞ることで、他店舗のメニューが混ざらないようにします。
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

// POST は新規メニュー作成です。
// 編集画面にすぐ遷移できるよう、最小情報でも下書きを作れるようにしています。
export async function POST(req: Request) {
    try {
        const auth = await requireShopId();
        if (!auth.ok) {
            return auth.res;
        }

        const body = await readJson<MenuCreateBody>(req);

        // 下書き作成では、名前未入力でも仮タイトルで進められるようにします。
        const name = toRequiredTrimmedString(body?.name) ?? "新しいメニュー";

        // 価格だけは数値ルールが多いので専用 helper で検証します。
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

        // 新規作成直後は誤公開を防ぐため、既定は非公開です。
        const isPublished = toBooleanOrDefault(body?.isPublished, false);
        let allergenMap: Record<string, AllergenStatus> = {};

        if (allergenStatusBySlug !== undefined) {
            // アレルゲン状態は { slug: status } の連想配列だけを受け付けます。
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

        // 送られてきた slug が本当にマスタに存在するか確認します。
        // 存在しない値を黙って通すと、入力ミスに気付きにくくなるためです。
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

        // MenuItem と中間テーブルを同時に保存するため transaction を使います。
        // 途中で失敗したら両方とも取り消され、中途半端なデータを防げます。
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
            // バリデーション系の失敗は 400 として返します。
            return NextResponse.json({ error: e.message }, { status: 400 });
        }
        return internalError(e);
    }
}
