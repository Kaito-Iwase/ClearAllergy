// app/(public)/shops/[shopId]/menus/[menuId]/page.tsx
// ユーザー側の商品詳細ページ（Prisma直叩き版）
// 目的：DBからメニュー＋アレルゲン状態を取得し、警告バナーを表示する。

import React from "react";
import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";

// アレルゲン状態（DB enum と同じ文字列）
type AllergenStatus = "CONTAINS" | "FREE" | "MAY_CONTAIN";

type PageProps = {
    params:
        | Promise<{ shopId: string; menuId: string }>
        | { shopId: string; menuId: string };
};

// DBから「商品＋アレルゲン状態」を取得する関数（サーバーで実行される）
async function getMenuFromDb(menuId: string) {
    // findUnique = 主キー(id)で1件だけ取る
    const menu = await prisma.menuItem.findUnique({
        where: { id: menuId },
        select: {
            id: true,
            shopId: true,
            name: true,
            description: true,
            priceYen: true,
            category: true,
            ingredients: true,
            precaution: true,
            imageUrl: true,
            isPublished: true,
            createdAt: true,
            updatedAt: true,
            allergenLinks: {
                select: {
                    status: true,
                    allergen: {
                        select: {
                            slug: true,
                            nameJa: true,
                            nameEn: true,
                            sortOrder: true,
                        },
                    },
                },
            },
        },
    });

    if (!menu) return null;

    // フロントで扱いやすい形に整形（APIと同じ考え方）
    const allergens = menu.allergenLinks
        .map((link) => ({
            slug: link.allergen.slug,
            nameJa: link.allergen.nameJa,
            nameEn: link.allergen.nameEn,
            sortOrder: link.allergen.sortOrder,
            status: link.status as AllergenStatus,
        }))
        .sort((a, b) => a.sortOrder - b.sortOrder);

    return {
        ...menu,
        allergens,
    };
}

export default async function MenuDetailPage({ params }: PageProps) {
    const { menuId } = await params;

    // ここでmenuIdが空なら、ルーティングがおかしいので即わかる
    if (!menuId) {
        return <div className="p-6">menuId が取得できていません</div>;
    }

    const menu = await getMenuFromDb(menuId);

    // 見つからないなら 404ページ
    if (!menu) notFound();

    // 公開/非公開をユーザー側で守る（MVPではこれが安全）
    // 非公開なら「存在しない」扱いにして情報を隠す
    if (!menu.isPublished) notFound();

    // アレルゲン状態の抽出
    const contains = menu.allergens.filter((a) => a.status === "CONTAINS");
    const mayContain = menu.allergens.filter((a) => a.status === "MAY_CONTAIN");

    const containsText =
        contains.length > 0
            ? `アレルゲン情報：${contains.map((a) => a.nameJa).join("、")}を含みます`
            : null;

    const mayContainText =
        mayContain.length > 0
            ? `注意：${mayContain.map((a) => a.nameJa).join("、")}は混入の可能性があります`
            : null;

    return (
        <div className="min-h-screen bg-white">
            <div className="mx-auto max-w-5xl px-4 py-6">
                {/* 警告バナー */}
                {containsText && (
                    <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                        <div className="flex items-start gap-3">
                            <div className="text-red-600">⚠️</div>
                            <div>
                                <div className="font-semibold text-red-800">
                                    {containsText}
                                </div>
                                {mayContainText && (
                                    <div className="mt-1 text-sm text-red-700">
                                        {mayContainText}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {!containsText && mayContainText && (
                    <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                        <div className="flex items-start gap-3">
                            <div className="text-amber-700">⚠️</div>
                            <div className="font-semibold text-amber-800">
                                {mayContainText}
                            </div>
                        </div>
                    </div>
                )}

                {/* 基本情報 */}
                <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                    <h1 className="text-2xl font-bold text-gray-900">
                        {menu.name}
                    </h1>

                    {menu.description && (
                        <p className="mt-2 text-gray-600">{menu.description}</p>
                    )}

                    {menu.priceYen !== null && (
                        <div className="mt-2 text-lg font-semibold text-gray-900">
                            ¥{menu.priceYen.toLocaleString()}{" "}
                            <span className="text-sm text-gray-500">
                                (税込)
                            </span>
                        </div>
                    )}

                    <div className="mt-3 flex flex-wrap gap-2">
                        {contains.map((a) => (
                            <span
                                key={a.slug}
                                className="rounded-full bg-red-50 px-3 py-1 text-sm font-medium text-red-800"
                                title={`${a.nameJa} / ${a.nameEn}`}
                            >
                                {a.nameJa} 含む
                            </span>
                        ))}
                        {mayContain.map((a) => (
                            <span
                                key={a.slug}
                                className="rounded-full bg-amber-50 px-3 py-1 text-sm font-medium text-amber-800"
                                title={`${a.nameJa} / ${a.nameEn}`}
                            >
                                {a.nameJa} 注意
                            </span>
                        ))}
                    </div>
                </div>

                {/* 原材料 */}
                <div className="mt-6 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                    <h2 className="mb-2 text-lg font-bold text-gray-900">
                        原材料名
                    </h2>
                    <p className="text-gray-700">
                        {menu.ingredients ?? "（未入力）"}
                    </p>

                    <p className="mt-3 text-sm text-gray-500">
                        {menu.precaution ??
                            "※本製品の製造工程では、他のアレルゲンが混入する可能性があります。最終判断はご自身でお願いします。"}
                    </p>
                </div>

                {/* 免責 */}
                <div className="mt-6 rounded-2xl border border-yellow-200 bg-yellow-50 p-5">
                    <div className="font-semibold text-yellow-900">
                        免責事項
                    </div>
                    <p className="mt-2 text-sm text-yellow-900/90">
                        アレルギー情報は、商品の原材料を精査し、お客様に提供するものです。
                        調理過程での微量混入（コンタミネーション）の可能性を完全に否定するものではありません。
                        最終的な判断はお客様ご自身にお願いいたします。
                    </p>
                </div>
            </div>
        </div>
    );
}
