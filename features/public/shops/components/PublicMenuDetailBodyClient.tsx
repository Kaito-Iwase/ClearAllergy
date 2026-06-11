"use client";

import Link from "next/link";
import Image from "next/image";
import type { CSSProperties } from "react";
import MenuAllergenAlertClient from "@/features/public/shops/components/MenuAllergenAlertClient";
import SelectedFreeAllergenCardsClient from "@/features/public/shops/components/SelectedFreeAllergenCardsClient";
import {
    UserAllergenPreferencePanel,
    type UserAllergenPreferenceAllergen,
    useUserAllergenPreferenceState,
} from "@/features/public/shops/components/UserAllergenPreferenceClient";
import {
    statusBadgeClass,
    statusLabelJa,
    type AllergenClassificationNotice,
    type AllergenStatus,
} from "@/lib/allergens";
import {
    parseMenuImageFit,
    parseMenuImageFrame,
    parseMenuImagePositionPercent,
    parseMenuImageZoom,
    type MenuImageFit,
    type MenuImageFrame,
} from "@/lib/utils/menu-image-display";

type AllergenRow = {
    slug: string;
    nameJa: string;
    status: AllergenStatus;
};

export default function PublicMenuDetailBodyClient(props: {
    shopId: string;
    shopName: string;
    menuName: string;
    description: string | null;
    category: string | null;
    priceText: string;
    updatedAtText: string;
    safeImageUrl: string | null;
    imageFrame: string | null;
    imageFit: string | null;
    imagePosition: string | null;
    imageZoom: number | null;
    imagePositionX: number | null;
    imagePositionY: number | null;
    ingredients: string | null;
    precaution: string | null;
    specifiedIngredientNotice: AllergenClassificationNotice;
    recommendedIngredientNotice: AllergenClassificationNotice;
    allergensForClient: UserAllergenPreferenceAllergen[];
    statusBySlugForClient: Record<string, AllergenStatus>;
    rows: AllergenRow[];
}) {
    const {
        shopId,
        shopName,
        menuName,
        description,
        category,
        priceText,
        updatedAtText,
        safeImageUrl,
        imageFrame,
        imageFit,
        imageZoom,
        imagePositionX,
        imagePositionY,
        ingredients,
        precaution,
        specifiedIngredientNotice,
        recommendedIngredientNotice,
        allergensForClient,
        statusBySlugForClient,
        rows,
    } = props;

    const preferenceState = useUserAllergenPreferenceState();
    const displayFrame: MenuImageFrame = parseMenuImageFrame(imageFrame);
    const displayFit: MenuImageFit = parseMenuImageFit(imageFit);
    const displayZoom = parseMenuImageZoom(imageZoom);
    const displayPositionX = parseMenuImagePositionPercent(imagePositionX);
    const displayPositionY = parseMenuImagePositionPercent(imagePositionY);

    const imageStyle: CSSProperties = safeImageUrl
        ? {
              objectFit: displayFit,
              objectPosition: `${displayPositionX}% ${displayPositionY}%`,
              transform: `scale(${displayZoom / 100})`,
              transformOrigin: `${displayPositionX}% ${displayPositionY}%`,
          }
        : {
              backgroundImage:
                  "linear-gradient(135deg, rgba(19,236,19,0.25), rgba(0,0,0,0.05))",
          };
    const preferencePanel = (
        <UserAllergenPreferencePanel
            allergens={allergensForClient}
            targetSlugs={preferenceState.targetSlugs}
            highlightSlugs={preferenceState.highlightSlugs}
            excludedSlugs={preferenceState.excludedSlugs}
            includeMayContain={preferenceState.includeMayContain}
            loaded={preferenceState.loaded}
            message={preferenceState.message}
            isOpen={preferenceState.isOpen}
            onToggleOpen={() => preferenceState.setIsOpen((prev) => !prev)}
            onToggleTargetSlug={preferenceState.toggleTargetSlug}
            onToggleIncludeMayContain={preferenceState.toggleIncludeMayContain}
            onApplyHighlight={preferenceState.applyHighlight}
            onApplyExclude={preferenceState.applyExclude}
            onClear={preferenceState.onClear}
        />
    );

    return (
        <>
            <div className="lg:hidden">{preferencePanel}</div>

            <MenuAllergenAlertClient
                allergens={allergensForClient}
                statusBySlug={statusBySlugForClient}
            />

            <div className="space-y-4">
                <AllergenClassificationNoticeCard
                    notice={specifiedIngredientNotice}
                />
                <AllergenClassificationNoticeCard
                    notice={recommendedIngredientNotice}
                />
            </div>

            <div className="grid grid-cols-1 gap-8 lg:grid-cols-3 lg:items-start">
                <div className="space-y-8 lg:col-span-2">
                    <div className="grid grid-cols-1 items-start gap-x-8 gap-y-6 md:grid-cols-2 lg:gap-x-12">
                        <div
                            className={`relative overflow-hidden rounded-2xl bg-neutral-100 shadow-sm ${
                                displayFrame === "wide"
                                    ? "aspect-[4/3]"
                                    : "aspect-square"
                            }`}
                        >
                            <div className="absolute right-4 top-4 z-10 flex gap-2">
                                <button
                                    type="button"
                                    className="rounded-full bg-white/90 p-2 shadow-sm hover:text-[#13ec13]"
                                >
                                    ♡
                                </button>
                                <button
                                    type="button"
                                    className="rounded-full bg-white/90 p-2 shadow-sm hover:text-[#13ec13]"
                                >
                                    ↗
                                </button>
                            </div>

                            {safeImageUrl ? (
                                <Image
                                    src={safeImageUrl}
                                    alt={menuName}
                                    fill
                                    priority
                                    sizes="(min-width: 1024px) 590px, (min-width: 768px) 50vw, 100vw"
                                    className="absolute inset-0 h-full w-full transition-transform duration-300 hover:scale-[1.03]"
                                    style={imageStyle}
                                />
                            ) : (
                                <div
                                    className="absolute inset-0"
                                    style={imageStyle}
                                    aria-label={menuName}
                                />
                            )}
                        </div>

                        <div className="flex flex-col gap-6">
                            <div>
                                <p className="mb-2 text-sm font-semibold text-gray-500">
                                    {shopName} の公開メニュー
                                </p>
                                <div className="mb-2 flex items-center gap-2">
                                    {category ? (
                                        <span className="rounded-full bg-[#13ec13]/20 px-2.5 py-0.5 text-xs font-bold text-green-800">
                                            {category}
                                        </span>
                                    ) : (
                                        <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-bold text-gray-700">
                                            カテゴリ未設定
                                        </span>
                                    )}
                                </div>

                                <h2 className="mb-2 text-3xl font-extrabold">
                                    {menuName}
                                </h2>

                                {description ? (
                                    <p className="mb-4 text-lg text-gray-600">
                                        {description}
                                    </p>
                                ) : (
                                    <p className="mb-4 text-lg text-gray-500">
                                        説明は未登録です。
                                    </p>
                                )}

                                <div className="mb-6 flex items-baseline gap-2">
                                    <span className="text-2xl font-extrabold">
                                        {priceText}
                                    </span>
                                    <span className="text-sm text-gray-500">
                                        （税込）
                                    </span>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <Link
                                    href={`/shops/${shopId}`}
                                    className="block w-full rounded-lg bg-[#13ec13] px-6 py-3 text-center font-bold text-black shadow-md transition hover:bg-[#0db80d] hover:shadow-lg"
                                >
                                    店舗ページで他のメニューを見る
                                </Link>

                                <p className="text-xs text-gray-500">
                                    更新： {updatedAtText}
                                </p>
                            </div>
                        </div>

                        <div className="md:col-span-2">
                            <SelectedFreeAllergenCardsClient
                                allergens={allergensForClient}
                                statusBySlug={statusBySlugForClient}
                            />
                        </div>
                    </div>

                    <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
                        <div className="mb-4 flex items-center gap-2 border-b border-gray-100 pb-3">
                            <span className="text-[#13ec13]">🧺</span>
                            <h3 className="text-xl font-bold">原材料名</h3>
                        </div>

                        {ingredients ? (
                            <p className="text-base leading-relaxed text-gray-700">
                                {ingredients}
                            </p>
                        ) : (
                            <p className="text-base text-gray-500">
                                原材料は未登録です。
                            </p>
                        )}

                        {precaution ? (
                            <div className="mt-4 rounded-lg bg-gray-50 p-4 text-sm text-gray-600">
                                ※ 注意事項：{precaution}
                            </div>
                        ) : null}
                    </div>

                    <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
                        <div className="mb-4 flex items-center gap-2 border-b border-gray-100 pb-3">
                            <span className="text-[#13ec13]">🧾</span>
                            <h3 className="text-xl font-bold">
                                アレルゲン（29品目）
                            </h3>
                        </div>

                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            {rows.map((row) => (
                                <div
                                    key={row.slug}
                                    className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2 hover:bg-gray-50"
                                >
                                    <span className="text-sm font-medium text-gray-700">
                                        {row.nameJa}
                                    </span>
                                    <span
                                        className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${statusBadgeClass(
                                            row.status,
                                        )}`}
                                        title={row.slug}
                                    >
                                        {statusLabelJa(row.status)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="flex flex-col gap-6">
                    <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
                        <div className="mb-4 flex items-center gap-2">
                            <span className="text-orange-500">ℹ️</span>
                            <h3 className="text-lg font-bold">注意事項</h3>
                        </div>

                        <ul className="list-disc space-y-2 pl-4 text-sm text-gray-600">
                            <li>体調や個人差により反応が異なる場合があります。</li>
                            <li>
                                コンタミネーションの可能性がある場合は店舗へ確認してください。
                            </li>
                            <li>
                                表示内容は更新されることがあります。最終更新日時も確認してください。
                            </li>
                        </ul>
                    </div>

                    <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
                        <h3 className="text-lg font-bold">店舗</h3>
                        <p className="mt-2 text-sm text-gray-600">
                            {shopName}
                        </p>
                        <Link
                            href={`/shops/${shopId}`}
                            className="mt-4 inline-flex w-full items-center justify-center rounded-lg bg-[#13ec13] px-4 py-2 text-sm font-bold text-black hover:bg-[#0db80d]"
                        >
                            店舗詳細へ
                        </Link>
                    </div>

                    <div className="hidden lg:block">{preferencePanel}</div>
                </div>
            </div>
        </>
    );
}

function AllergenClassificationNoticeCard({
    notice,
}: {
    notice: AllergenClassificationNotice;
}) {
    return (
        <div className={`rounded-xl p-6 shadow-sm ${notice.boxClass}`}>
            <h2
                className={`text-xl font-extrabold md:text-2xl ${notice.titleClass}`}
            >
                {notice.title}
            </h2>

            <p className={`mt-2 text-sm font-medium ${notice.textClass}`}>
                {notice.desc}
            </p>

            <p className={`mt-2 text-sm ${notice.textClass}`}>
                判定結果：{notice.resultText}
            </p>
            {notice.unknownText ? (
                <p className={`mt-2 text-sm ${notice.textClass}`}>
                    {notice.unknownText}
                </p>
            ) : null}
        </div>
    );
}
