"use client";

import { usePublicApplyProof, usePreviousPublicInformation } from "../freshness/presentation";

import { STORE_ALLERGEN_NOTE } from "@/lib/public-prototype";
import { getSelectedAllergenSlugs } from "@/lib/public-allergen-preferences";

// このコンポーネントは店舗詳細画面の公開メニュー一覧です。
// localStorage に保存された「避けたいアレルゲン設定」を読み、
// 通常表示と個人向け表示を切り替えてカード一覧を描画します。

import React from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
    buildSelectedAllergenSummary,
    buildDefaultAllergenSummaries,
    createStatusBySlug,
    SPECIFIED_INGREDIENT_SLUGS,
    type AllergenStatus,
} from "@/lib/allergens";
import { formatDateTimeJa, formatPriceYenLabel } from "@/lib/utils/formatters";
import { parseMenuImageFit, parseMenuImageFrame, parseMenuImagePositionPercent, parseMenuImageZoom } from "@/lib/utils/menu-image-display";
import { useUserAllergenPreferences } from "@/features/public/shops/components/UserAllergenPreferenceClient";
import MenuAllergenSummary from "./MenuAllergenSummary";
import { groupPublicMenus, searchPublicMenus } from "./public-menu-search";
import { getAllergenPreferenceMatches } from "@/lib/public-allergen-preference-match";
import type { PublicMenuImages, PublicShopDetailData } from "../freshness/contracts";

type AllergenMasterItem = {
    slug: string;
    nameJa: string;
    sortOrder: number;
};

type ShopMenuCardData = PublicShopDetailData["menusForClient"][number];

type MenuItemWithStatus = {
    menu: ShopMenuCardData;
    statusBySlug: Record<string, AllergenStatus>;
};

function MenuThumbnail({ image }: { image: PublicMenuImages[string] }) {
    const [failed, setFailed] = React.useState(false);
    if (failed) return null;

    const position = `${parseMenuImagePositionPercent(image.imagePositionX)}% ${parseMenuImagePositionPercent(image.imagePositionY)}%`;
    return (
        <div className={`relative w-20 shrink-0 overflow-hidden rounded-lg bg-neutral-100 lg:w-24 ${parseMenuImageFrame(image.imageFrame) === "wide" ? "aspect-[4/3]" : "aspect-square"}`}>
            <Image
                src={image.safeImageUrl}
                alt=""
                fill
                sizes="(min-width: 1024px) 96px, 80px"
                style={{
                    objectFit: parseMenuImageFit(image.imageFit),
                    objectPosition: position,
                    transform: `scale(${parseMenuImageZoom(image.imageZoom) / 100})`,
                    transformOrigin: position,
                }}
                onError={() => setFailed(true)}
            />
        </div>
    );
}

function CategoryFilterButton({ active, onClick, children }: {
    active: boolean;
    onClick: () => void;
    children: React.ReactNode;
}) {
    return (
        <button type="button" aria-pressed={active} onClick={onClick}
            className="min-h-11 max-w-[15rem] shrink-0 wrap-anywhere rounded-full border border-gray-300 bg-white px-4 py-2 text-left text-sm font-semibold text-gray-800 hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700 aria-pressed:border-green-700 aria-pressed:bg-green-100 aria-pressed:text-green-950">
            {children}
        </button>
    );
}

export default function ShopMenuListClient({
    shopId,
    menus,
    allergenMaster,
    storeHandledAllergenSlugs = [],
    menuImages,
}: {
    shopId: string;
    menus: ShopMenuCardData[];
    allergenMaster: AllergenMasterItem[];
    storeHandledAllergenSlugs?: string[];
    menuImages?: PublicMenuImages;
}) {
    usePublicApplyProof("shop-menus");
    const previous = usePreviousPublicInformation();
    const router = useRouter();
    const searchParams = useSearchParams();
    const q = (searchParams.get("q") ?? "").trim();
    const listId = React.useId();
    const [selectedCategory, setSelectedCategory] = React.useState<string | null>();

    // 端末に保存されたアレルゲン設定を読み込み、画面に反映します。
    const { preferences: { highlightSlugs, excludedSlugs, includeMayContain }, loaded } = useUserAllergenPreferences();

    // slug から日本語名や並び順をすぐ引けるよう、Map にしておきます。
    const nameJaBySlug = React.useMemo(() => {
        return new Map(
            allergenMaster.map((allergen) => [allergen.slug, allergen.nameJa]),
        );
    }, [allergenMaster]);

    const rankBySlug = React.useMemo(() => {
        return new Map(
            allergenMaster.map((allergen, index) => [allergen.slug, index]),
        );
    }, [allergenMaster]);

    const hasPreference =
        loaded && (highlightSlugs.length > 0 || excludedSlugs.length > 0);
    const selectedSlugs = getSelectedAllergenSlugs({ highlightSlugs, excludedSlugs });
    const checkedAllergenLabel = hasPreference
        ? allergenMaster.filter((allergen) => selectedSlugs.includes(allergen.slug)).map((allergen) => allergen.nameJa).join("・")
        : `特定原材料（${SPECIFIED_INGREDIENT_SLUGS.length}品目）`;

    const isExcludedByPreference = React.useCallback((statusBySlug: Record<string, AllergenStatus>) => {
        return getAllergenPreferenceMatches({ statusBySlug, slugs: excludedSlugs,
            includeMayContain, storeHandledAllergenSlugs }).length > 0;
    }, [excludedSlugs, includeMayContain, storeHandledAllergenSlugs]);

    const searchedMenus = React.useMemo(() => searchPublicMenus(menus, q), [menus, q]);

    const menuItems = React.useMemo<MenuItemWithStatus[]>(() => {
        return searchedMenus.map((menu) => ({
            menu,
            statusBySlug: createStatusBySlug(allergenMaster, menu.allergenLinks),
        }));
    }, [allergenMaster, searchedMenus]);

    const visibleMenuItems = React.useMemo(() => {
        if (!hasPreference) {
            return menuItems;
        }

        return menuItems.filter(
            ({ statusBySlug }) => !isExcludedByPreference(statusBySlug),
        );
    }, [hasPreference, isExcludedByPreference, menuItems]);

    const excludedMenuCount = menuItems.length - visibleMenuItems.length;
    const groups = React.useMemo(() => groupPublicMenus(visibleMenuItems), [visibleMenuItems]);
    const categoryItems = selectedCategory === undefined ? undefined : groups.get(selectedCategory);
    if (selectedCategory !== undefined && !categoryItems) setSelectedCategory(undefined);
    const displayedGroups = categoryItems && selectedCategory !== undefined
        ? [[selectedCategory, categoryItems] as const] : Array.from(groups);
    const showCategoryHeadings = groups.size > 1 || !groups.has(null);
    const CardHeading = showCategoryHeadings ? "h4" : "h3";
    const CardSubheading = showCategoryHeadings ? "h5" : "h4";
    let uncategorizedLabel = "カテゴリなし";
    if (groups.has(uncategorizedLabel)) {
        uncategorizedLabel = "カテゴリなし（自動）";
        for (let suffix = 2; groups.has(uncategorizedLabel); suffix++) {
            uncategorizedLabel = `カテゴリなし（自動${suffix}）`;
        }
    }
    const categoryLabel = (category: string | null) => category ?? uncategorizedLabel;

    function clearSearch() {
        const params = new URLSearchParams(searchParams.toString());
        params.delete("q");
        const query = params.toString();
        router.replace(`/shops/${shopId}${query ? `?${query}` : ""}`);
    }

    function renderMenuCard({ menu, statusBySlug }: MenuItemWithStatus) {
        const summaryArgs = {
            statusBySlug,
            nameJaBySlug,
            rankBySlug,
        };
        const matches = hasPreference
            ? getAllergenPreferenceMatches({ statusBySlug, slugs: highlightSlugs, includeMayContain, storeHandledAllergenSlugs })
            : [];
        const defaults = hasPreference ? null : buildDefaultAllergenSummaries(summaryArgs);
        const activeSummary = defaults?.specified ?? buildSelectedAllergenSummary({
            ...summaryArgs,
            selectedSlugs,
            includeMayContain,
            storeHandledAllergenSlugs: new Set(matches.filter(match => match.source === "STORE_HANDLED").map(match => match.slug)),
        });
        const showOtherSummary = defaults && defaults.otherCount > 0 && defaults.other.badge !== "safe";
        const image = menuImages?.[menu.id];
        const titleId = `${listId}-${menu.id}`;
        const registrationId = `${titleId}-registration`;
        const precautionId = menu.precaution?.trim() ? `${titleId}-precaution` : undefined;
        const descriptionIds = [
            previous && `${registrationId}-previous`,
            `${titleId}-scope`,
            registrationId,
            activeSummary.storeHandledCount > 0 && `${registrationId}-supplement`,
            showOtherSummary && `${titleId}-other-heading ${titleId}-other`,
            precautionId,
        ].filter(Boolean).join(" ");

        return (
            <Link
                key={menu.id}
                href={`/shops/${shopId}/menus/${menu.id}`}
                prefetch={false}
                aria-labelledby={titleId}
                aria-describedby={descriptionIds}
                className="group block min-w-0 rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:border-gray-400 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700"
            >
                <div className="flex items-start gap-3">
                    {image?.updatedAt === menu.updatedAt ? (
                        <MenuThumbnail key={image.safeImageUrl} image={image} />
                    ) : null}
                    <div className="min-w-0 flex-1">
                        <CardHeading id={titleId} className="wrap-anywhere text-lg font-extrabold leading-snug text-gray-900">
                            {menu.name}
                        </CardHeading>
                        <p className="mt-1 flex flex-wrap items-baseline gap-x-2 text-sm leading-6 text-gray-700">
                            <span className="wrap-anywhere">{menu.category?.trim() || "カテゴリ未設定"}</span>
                            <span className="font-bold text-gray-900">{formatPriceYenLabel(menu.priceYen)}</span>
                        </p>
                    </div>

                    <span aria-hidden="true" className="shrink-0 text-gray-500 group-hover:text-gray-700">
                        ›
                    </span>
                </div>

                <div className="mt-3 border-t border-gray-200 pt-3">
                    <p id={`${titleId}-scope`} className="wrap-anywhere text-sm leading-6 text-gray-700">
                        確認対象：{checkedAllergenLabel}
                    </p>
                    <MenuAllergenSummary id={registrationId} summary={activeSummary} highlightedSlugs={new Set(matches.map(match => match.slug))} />
                    {showOtherSummary ? (
                        <div role="group" aria-label="その他のアレルゲン" className="mt-3 border-t border-gray-200 pt-3">
                            <CardSubheading id={`${titleId}-other-heading`} className="text-sm font-bold text-gray-900">その他のアレルゲン（{defaults.otherCount}品目）</CardSubheading>
                            <MenuAllergenSummary id={`${titleId}-other`} summary={defaults.other} />
                        </div>
                    ) : null}
                </div>
                {precautionId ? (
                    <div role="group" aria-label="店舗の注意書き" className="mt-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                        <CardSubheading id={precautionId} className="text-sm font-bold leading-5 text-gray-700">店舗の注意書き</CardSubheading>
                        <p className="mt-1 whitespace-pre-wrap wrap-anywhere text-sm leading-6 text-gray-700">{menu.precaution}</p>
                    </div>
                ) : null}
                <p className="mt-3 text-xs leading-5 text-gray-600">
                    更新：{formatDateTimeJa(menu.updatedAt)}
                </p>
            </Link>
        );
    }

    return (
        <section
            id="public-menus"
            aria-labelledby={`${listId}-heading`}
            className="min-w-0 scroll-mt-32 rounded-xl border border-gray-100 bg-white p-4 shadow-sm sm:p-6"
        >
            <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
                <h2 id={`${listId}-heading`} className="text-base font-extrabold">公開メニュー</h2>
                <p className="text-xs text-gray-500" aria-live="polite">
                    {previous && "以前取得した登録情報による表示："}
                    表示 {categoryItems?.length ?? visibleMenuItems.length}件 / 検索対象 {searchedMenus.length}件
                </p>
            </div>

            <div className="mb-4 space-y-1 text-sm leading-6 text-gray-700">
                <p>店舗が登録した内容</p>
                {hasPreference && highlightSlugs.length > 0 ? (
                    <p>※ は注目設定に一致した品目に表示します。</p>
                ) : null}
            </div>

            {storeHandledAllergenSlugs.length > 0 && (
                <section aria-label="店舗全体の登録情報" className="mb-5 rounded-xl border border-amber-200 bg-amber-50/50 p-4">
                    <h3 className="text-sm font-bold text-amber-950">店舗の公開メニュー全体の登録情報</h3>
                    {previous && <p className="mt-2 text-sm font-bold text-amber-950">以前取得した登録・現在は未再確認</p>}
                    <p className="mt-2 text-sm leading-6 text-amber-950">「含む」登録のある品目：{allergenMaster.filter(item => storeHandledAllergenSlugs.includes(item.slug)).map(item => item.nameJa).join("・")}</p>
                    {hasPreference && <p className="mt-1 text-sm leading-6 text-amber-950">{previous ? "以前取得した登録での、あなたの確認対象" : "このうち、あなたの確認対象"}：{allergenMaster.filter(item => storeHandledAllergenSlugs.includes(item.slug) && selectedSlugs.includes(item.slug)).map(item => item.nameJa).join("・") || "該当なし"}</p>}
                    <p className="mt-2 text-xs leading-5 text-amber-900">個々のメニューの原材料登録とは別の情報です。{STORE_ALLERGEN_NOTE}</p>
                </section>
            )}

            {groups.size > 1 && (
                <div className="mb-5">
                    <p className="mb-2 text-xs leading-5 text-gray-600">料理のカテゴリで絞り込む（検索・除外設定を反映した件数）</p>
                    <div role="group" aria-label="メニューカテゴリ"
                        className="flex gap-2 overflow-x-auto p-1 md:flex-wrap">
                        <CategoryFilterButton active={!categoryItems} onClick={() => setSelectedCategory(undefined)}>
                            すべて（{visibleMenuItems.length}件）
                        </CategoryFilterButton>
                        {Array.from(groups, ([category, items]) => (
                            <CategoryFilterButton key={category === null ? "uncategorized" : "category:" + category}
                                active={categoryItems !== undefined && selectedCategory === category}
                                onClick={() => setSelectedCategory(category)}>
                                {categoryLabel(category)}（{items.length}件）
                            </CategoryFilterButton>
                        ))}
                    </div>
                </div>
            )}

            {searchedMenus.length === 0 ? (
                <div role="status" className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-6">
                    <p className="text-sm text-gray-700">
                        {previous ? (q !== ""
                            ? "以前取得した登録情報では、検索条件に一致する公開メニューがありません。"
                            : "以前取得した登録情報では、公開メニューがありません。") : q !== ""
                            ? "検索条件に一致する公開メニューがありません。"
                            : "現在公開中のメニューはありません。"}
                    </p>
                    {q !== "" ? (
                        <button type="button" onClick={clearSearch}
                            className="mt-3 min-h-11 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-800 hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-green-700">
                            メニュー検索を解除
                        </button>
                    ) : null}
                </div>
            ) : visibleMenuItems.length === 0 ? (
                <div role="status" className="rounded-xl border border-dashed border-red-200 bg-red-50 p-6">
                    <p className="text-sm font-bold text-red-800">
                        {previous ? "以前取得した登録情報と除外設定による表示は0件です。" : "除外設定により表示できるメニューがありません。"}
                    </p>
                    <p className="mt-2 text-xs leading-5 text-red-700">
                        必要に応じて、あなた向けのアレルゲン設定で「除外」を外してください。
                    </p>
                </div>
            ) : (
                <div className="space-y-6">
                    {displayedGroups.map(([category, items]) => (
                        <div key={category === null ? "uncategorized" : "category:" + category}>
                            {showCategoryHeadings && (
                                <h3 className="mb-3 wrap-anywhere text-sm font-bold text-gray-900">
                                    {categoryLabel(category)}（{items.length}件）
                                </h3>
                            )}
                            <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
                                {items.map(renderMenuCard)}
                            </div>
                        </div>
                    ))}
                </div>
            )}
            {hasPreference ? (
                <p className="mt-4 text-xs font-medium text-gray-500">
                    除外設定に一致するメニューは一覧から非表示になります
                    {includeMayContain
                        ? "（店舗登録の可能性あり・別メニューでの使用も対象）"
                        : "（含む登録のみ対象。店舗登録の注意情報は表示します）"}
                    。{excludedMenuCount > 0 ? `${excludedMenuCount}件を非表示にしています。` : ""}
                </p>
            ) : null}
        </section>
    );
}
