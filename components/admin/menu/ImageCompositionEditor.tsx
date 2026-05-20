"use client";

import Image from "next/image";
import React from "react";
import {
    DEFAULT_MENU_IMAGE_FIT,
    DEFAULT_MENU_IMAGE_FRAME,
    DEFAULT_MENU_IMAGE_POSITION,
    DEFAULT_MENU_IMAGE_POSITION_X,
    DEFAULT_MENU_IMAGE_POSITION_Y,
    DEFAULT_MENU_IMAGE_ZOOM,
    getPositionPresetPercent,
    type MenuImageFit,
    type MenuImageFrame,
    type MenuImagePosition,
} from "@/lib/menu-image-display";

export type CompositionValues = {
    imageFrame: MenuImageFrame;
    imageFit: MenuImageFit;
    imagePosition: MenuImagePosition;
    imageZoom: number;
    imagePositionX: number;
    imagePositionY: number;
};

type PreviewMode = "list" | "detail";
type SubjectKind = "menu" | "shop";

type PointerPoint = {
    x: number;
    y: number;
};

type DragState = {
    pointers: Map<number, PointerPoint>;
    startX: number;
    startY: number;
    startPositionX: number;
    startPositionY: number;
    startDistance: number | null;
    startZoom: number;
};

const FRAME_OPTIONS: Array<{ value: MenuImageFrame; label: string }> = [
    { value: "square", label: "正方形" },
    { value: "wide", label: "横長" },
];

const FIT_OPTIONS: Array<{ value: MenuImageFit; label: string }> = [
    { value: "cover", label: "余白なく表示" },
    { value: "contain", label: "全体を表示" },
];

const POSITION_OPTIONS: Array<{ value: MenuImagePosition; label: string }> = [
    { value: "center", label: "中央" },
    { value: "top", label: "上" },
    { value: "bottom", label: "下" },
    { value: "left", label: "左" },
    { value: "right", label: "右" },
];

const PREVIEW_OPTIONS: Array<{ value: PreviewMode; label: string }> = [
    { value: "list", label: "一覧カード" },
    { value: "detail", label: "詳細ページ" },
];

const MENU_COMPOSITION_PRESETS: Array<{
    id: string;
    title: string;
    description: string;
    values: CompositionValues;
}> = [
    {
        id: "hero",
        title: "料理を大きく見せる",
        description: "主役を大きめに見せたい時",
        values: {
            imageFrame: "square",
            imageFit: "cover",
            imagePosition: "center",
            imageZoom: 130,
            imagePositionX: 50,
            imagePositionY: 50,
        },
    },
    {
        id: "balanced",
        title: "バランスよく見せる",
        description: "料理と余白の両方を見せたい時",
        values: {
            imageFrame: "square",
            imageFit: "cover",
            imagePosition: "center",
            imageZoom: 110,
            imagePositionX: 50,
            imagePositionY: 50,
        },
    },
    {
        id: "full",
        title: "全体をきれいに収める",
        description: "器や背景まで見せたい時",
        values: {
            imageFrame: "wide",
            imageFit: "contain",
            imagePosition: "center",
            imageZoom: 100,
            imagePositionX: 50,
            imagePositionY: 50,
        },
    },
];

const SHOP_COMPOSITION_PRESETS: Array<{
    id: string;
    title: string;
    description: string;
    values: CompositionValues;
}> = [
    {
        id: "shop-hero",
        title: "店内を大きく見せる",
        description: "空間の雰囲気を強く出したい時",
        values: {
            imageFrame: "wide",
            imageFit: "cover",
            imagePosition: "center",
            imageZoom: 120,
            imagePositionX: 50,
            imagePositionY: 50,
        },
    },
    {
        id: "shop-balanced",
        title: "バランスよく見せる",
        description: "店舗名の文字も読みやすくしたい時",
        values: {
            imageFrame: "wide",
            imageFit: "cover",
            imagePosition: "center",
            imageZoom: 105,
            imagePositionX: 50,
            imagePositionY: 50,
        },
    },
    {
        id: "shop-full",
        title: "全体をきれいに収める",
        description: "入口や席まで広く見せたい時",
        values: {
            imageFrame: "wide",
            imageFit: "contain",
            imagePosition: "center",
            imageZoom: 100,
            imagePositionX: 50,
            imagePositionY: 50,
        },
    },
];

function clampPercent(value: number) {
    return Math.min(100, Math.max(0, Math.round(value)));
}

function clampZoom(value: number) {
    return Math.min(250, Math.max(50, Math.round(value)));
}

function getDistance(points: PointerPoint[]) {
    const [a, b] = points;
    return Math.hypot(a.x - b.x, a.y - b.y);
}

function isDirty(current: CompositionValues, initial: CompositionValues) {
    return (
        current.imageFrame !== initial.imageFrame ||
        current.imageFit !== initial.imageFit ||
        current.imagePosition !== initial.imagePosition ||
        current.imageZoom !== initial.imageZoom ||
        current.imagePositionX !== initial.imagePositionX ||
        current.imagePositionY !== initial.imagePositionY
    );
}

function getCompositionSummary(values: CompositionValues, subjectKind: SubjectKind) {
    const parts: string[] = [];
    const subject = subjectKind === "shop" ? "写真" : "料理";

    if (values.imageFit === "contain") {
        parts.push(
            subjectKind === "shop"
                ? "店舗写真の全体を表示しています"
                : "器や背景まで含めて表示しています",
        );
    } else if (values.imageZoom >= 130) {
        parts.push(`${subject}が大きく見える設定です`);
    } else {
        parts.push(`${subject}と余白のバランスを取った設定です`);
    }

    if (values.imagePositionY <= 30) {
        parts.push("少し上寄せです");
    } else if (values.imagePositionY >= 70) {
        parts.push("少し下寄せです");
    }

    if (values.imagePositionX <= 30) {
        parts.push("左側を重視しています");
    } else if (values.imagePositionX >= 70) {
        parts.push("右側を重視しています");
    }

    return parts.join("。") + "。";
}

function ImagePreview({
    imageSrc,
    imageAlt,
    values,
    compareOriginal,
    subjectName,
    subjectKind,
    previewMode,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onWheel,
    onDoubleClick,
}: {
    imageSrc: string;
    imageAlt: string;
    values: CompositionValues;
    compareOriginal: boolean;
    subjectName: string;
    subjectKind: SubjectKind;
    previewMode: PreviewMode;
    onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
    onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => void;
    onPointerUp: (event: React.PointerEvent<HTMLDivElement>) => void;
    onWheel: (event: React.WheelEvent<HTMLDivElement>) => void;
    onDoubleClick: () => void;
}) {
    const visibleValues = compareOriginal
        ? {
              ...values,
              imageFit: "contain" as const,
              imageZoom: 100,
              imagePositionX: 50,
              imagePositionY: 50,
          }
        : values;

    const imageStyle: React.CSSProperties = {
        objectFit: visibleValues.imageFit,
        objectPosition: `${visibleValues.imagePositionX}% ${visibleValues.imagePositionY}%`,
        transform: `scale(${visibleValues.imageZoom / 100})`,
        transformOrigin: `${visibleValues.imagePositionX}% ${visibleValues.imagePositionY}%`,
    };

    const frameClass =
        values.imageFrame === "wide" ? "aspect-[16/10]" : "aspect-square";

    const viewport = (
        <div
            className={`group relative overflow-hidden rounded-xl bg-neutral-100 ${frameClass} touch-none select-none overscroll-contain`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onWheelCapture={onWheel}
            onDoubleClick={onDoubleClick}
            role="application"
            aria-label="画像をドラッグして表示位置を調整"
            tabIndex={0}
        >
            <Image
                src={imageSrc}
                alt={imageAlt}
                fill
                sizes="(min-width: 768px) 50vw, 100vw"
                unoptimized={imageSrc.startsWith("blob:")}
                draggable={false}
                className="cursor-grab transition-transform duration-150 active:cursor-grabbing"
                style={imageStyle}
            />
            <div className="pointer-events-none absolute inset-[12%] rounded-lg border border-white/70 shadow-[0_0_0_999px_rgba(0,0,0,0.08)]" />
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.28)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.28)_1px,transparent_1px)] bg-[length:33.333%_33.333%] opacity-0 transition group-hover:opacity-100" />
            <div className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-black/60 px-3 py-1 text-xs font-bold text-white">
                ドラッグで位置調整
            </div>
            {compareOriginal ? (
                <div className="pointer-events-none absolute right-3 top-3 rounded-full bg-white/90 px-3 py-1 text-xs font-bold text-gray-900">
                    元画像
                </div>
            ) : null}
        </div>
    );

    if (previewMode === "detail") {
        return (
            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(180px,0.8fr)] md:items-center">
                    {viewport}
                    <div>
                        <p className="text-xs font-bold text-green-700">
                            {subjectKind === "shop"
                                ? "店舗ページ風"
                                : "詳細ページ風"}
                        </p>
                        <p className="mt-2 text-xl font-extrabold text-gray-950">
                            {subjectName ||
                                (subjectKind === "shop"
                                    ? "店舗名"
                                    : "メニュー名")}
                        </p>
                        <p className="mt-3 text-sm leading-6 text-gray-600">
                            {subjectKind === "shop"
                                ? "公開店舗ページで、カバー写真と店舗情報が並んだ時の見え方です。"
                                : "公開メニュー詳細で、写真と説明が並んだ時の見え方です。"}
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    const listPreviewMaxWidth =
        subjectKind === "shop" ? "max-w-md" : "max-w-sm";

    return (
        <div
            className={`mx-auto ${listPreviewMaxWidth} rounded-2xl border border-gray-200 bg-white p-3 shadow-sm`}
        >
            {viewport}
            <div className="p-2">
                <p className="mt-2 line-clamp-2 text-base font-extrabold text-gray-950">
                    {subjectName ||
                        (subjectKind === "shop" ? "店舗名" : "メニュー名")}
                </p>
                <p className="mt-1 text-xs font-semibold text-gray-500">
                    {subjectKind === "shop"
                        ? "店舗一覧カード風プレビュー"
                        : "一覧カード風プレビュー"}
                </p>
            </div>
        </div>
    );
}

export default function ImageCompositionEditor({
    imageSrc,
    imageAlt,
    subjectName,
    subjectKind = "menu",
    surface = "card",
    values,
    initialValues,
    onChange,
}: {
    imageSrc: string;
    imageAlt: string;
    subjectName: string;
    subjectKind?: SubjectKind;
    surface?: "card" | "plain";
    values: CompositionValues;
    initialValues?: CompositionValues;
    onChange: (next: Partial<CompositionValues>) => void;
}) {
    const [previewMode, setPreviewMode] = React.useState<PreviewMode>("list");
    const [detailsOpen, setDetailsOpen] = React.useState(false);
    const [compareOriginal, setCompareOriginal] = React.useState(false);
    const dragRef = React.useRef<DragState>({
        pointers: new Map(),
        startX: 0,
        startY: 0,
        startPositionX: values.imagePositionX,
        startPositionY: values.imagePositionY,
        startDistance: null,
        startZoom: values.imageZoom,
    });

    const baseline = initialValues ?? {
        imageFrame: DEFAULT_MENU_IMAGE_FRAME,
        imageFit: DEFAULT_MENU_IMAGE_FIT,
        imagePosition: DEFAULT_MENU_IMAGE_POSITION,
        imageZoom: DEFAULT_MENU_IMAGE_ZOOM,
        imagePositionX: DEFAULT_MENU_IMAGE_POSITION_X,
        imagePositionY: DEFAULT_MENU_IMAGE_POSITION_Y,
    };
    const changed = isDirty(values, baseline);
    const summary = getCompositionSummary(values, subjectKind);
    const presets =
        subjectKind === "shop"
            ? SHOP_COMPOSITION_PRESETS
            : MENU_COMPOSITION_PRESETS;

    function updatePosition(nextX: number, nextY: number) {
        const x = clampPercent(nextX);
        const y = clampPercent(nextY);
        const nextPosition: MenuImagePosition =
            x === 50 && y === 0
                ? "top"
                : x === 50 && y === 100
                  ? "bottom"
                  : x === 0 && y === 50
                    ? "left"
                    : x === 100 && y === 50
                      ? "right"
                      : "center";
        onChange({
            imagePosition: nextPosition,
            imagePositionX: x,
            imagePositionY: y,
        });
    }

    function setPositionPreset(position: MenuImagePosition) {
        const percent = getPositionPresetPercent(position);
        onChange({
            imagePosition: position,
            imagePositionX: percent.x,
            imagePositionY: percent.y,
        });
    }

    function applyPreset(preset: CompositionValues) {
        onChange(preset);
        setCompareOriginal(false);
    }

    function resetToInitial() {
        onChange(baseline);
        setCompareOriginal(false);
    }

    function resetCenter() {
        onChange({
            imagePosition: "center",
            imagePositionX: 50,
            imagePositionY: 50,
        });
    }

    function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
        event.currentTarget.setPointerCapture(event.pointerId);
        const drag = dragRef.current;
        drag.pointers.set(event.pointerId, {
            x: event.clientX,
            y: event.clientY,
        });
        const points = [...drag.pointers.values()];
        drag.startX = event.clientX;
        drag.startY = event.clientY;
        drag.startPositionX = values.imagePositionX;
        drag.startPositionY = values.imagePositionY;
        drag.startZoom = values.imageZoom;
        drag.startDistance = points.length >= 2 ? getDistance(points) : null;
    }

    function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
        const drag = dragRef.current;
        if (!drag.pointers.has(event.pointerId)) {
            return;
        }

        drag.pointers.set(event.pointerId, {
            x: event.clientX,
            y: event.clientY,
        });

        const points = [...drag.pointers.values()];
        if (points.length >= 2 && drag.startDistance) {
            const nextDistance = getDistance(points);
            onChange({
                imageZoom: clampZoom(
                    drag.startZoom * (nextDistance / drag.startDistance),
                ),
            });
            return;
        }

        const dx = event.clientX - drag.startX;
        const dy = event.clientY - drag.startY;
        updatePosition(
            drag.startPositionX - dx / 2.5,
            drag.startPositionY - dy / 2.5,
        );
    }

    function handlePointerUp(event: React.PointerEvent<HTMLDivElement>) {
        const drag = dragRef.current;
        drag.pointers.delete(event.pointerId);
        if (drag.pointers.size === 1) {
            const [point] = [...drag.pointers.values()];
            drag.startX = point.x;
            drag.startY = point.y;
            drag.startPositionX = values.imagePositionX;
            drag.startPositionY = values.imagePositionY;
            drag.startDistance = null;
            drag.startZoom = values.imageZoom;
        }
    }

    function handleWheel(event: React.WheelEvent<HTMLDivElement>) {
        event.preventDefault();
        event.stopPropagation();
        const nextZoom = values.imageZoom + (event.deltaY < 0 ? 5 : -5);
        onChange({ imageZoom: clampZoom(nextZoom) });
    }

    const surfaceClass =
        surface === "plain"
            ? "mt-4"
            : "mt-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm";

    return (
        <section className={surfaceClass}>
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
                <div className="order-1">
                    <div className="mb-3">
                        <div>
                            <p className="text-sm font-extrabold text-gray-950">
                                掲載結果プレビュー
                            </p>
                            <p className="mt-1 text-xs leading-5 text-gray-500">
                                写真を直接ドラッグできます。ホイールまたはピンチでズームできます。
                            </p>
                        </div>
                    </div>

                    <ImagePreview
                        imageSrc={imageSrc}
                        imageAlt={imageAlt}
                        values={values}
                        compareOriginal={compareOriginal}
                        subjectName={subjectName}
                        subjectKind={subjectKind}
                        previewMode={previewMode}
                        onPointerDown={handlePointerDown}
                        onPointerMove={handlePointerMove}
                        onPointerUp={handlePointerUp}
                        onWheel={handleWheel}
                        onDoubleClick={resetCenter}
                    />

                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                        <span
                            className={`rounded-full px-3 py-1 font-bold ${
                                changed
                                    ? "bg-amber-50 text-amber-800"
                                    : "bg-emerald-50 text-emerald-800"
                            }`}
                        >
                            {changed ? "構図を変更済み" : "保存時の構図"}
                        </span>
                        <span className="text-gray-500">{summary}</span>
                    </div>
                </div>

                <div className="order-2 space-y-4">
                    <div>
                        <p className="text-sm font-extrabold text-gray-950">
                            おすすめ構図
                        </p>
                        <div className="mt-2 grid gap-2">
                            {presets.map((preset) => (
                                <button
                                    key={preset.id}
                                    type="button"
                                    onClick={() => applyPreset(preset.values)}
                                    className="rounded-xl border border-gray-200 bg-white p-3 text-left transition hover:border-green-300 hover:bg-green-50"
                                >
                                    <span className="block text-sm font-extrabold text-gray-950">
                                        {preset.title}
                                    </span>
                                    <span className="mt-1 block text-xs leading-5 text-gray-500">
                                        {preset.description}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <p className="text-sm font-extrabold text-gray-950">
                            プレビュー切替
                        </p>
                        <div className="mt-2 inline-flex rounded-xl bg-gray-100 p-1">
                            {PREVIEW_OPTIONS.map((option) => (
                                <button
                                    key={option.value}
                                    type="button"
                                    onClick={() => setPreviewMode(option.value)}
                                    className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
                                        previewMode === option.value
                                            ? "bg-white text-gray-950 shadow-sm"
                                            : "text-gray-600"
                                    }`}
                                >
                                    {option.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={() => setCompareOriginal((prev) => !prev)}
                            className={`rounded-xl px-3 py-2 text-sm font-bold ${
                                compareOriginal
                                    ? "bg-gray-900 text-white"
                                    : "bg-gray-100 text-gray-800"
                            }`}
                        >
                            元画像と比較
                        </button>
                        <button
                            type="button"
                            onClick={resetCenter}
                            className="rounded-xl bg-gray-100 px-3 py-2 text-sm font-bold text-gray-800"
                        >
                            中央に戻す
                        </button>
                        <button
                            type="button"
                            onClick={resetToInitial}
                            className="rounded-xl bg-gray-100 px-3 py-2 text-sm font-bold text-gray-800"
                        >
                            リセット
                        </button>
                    </div>

                    <div className="rounded-2xl border border-gray-200">
                        <button
                            type="button"
                            onClick={() => setDetailsOpen((prev) => !prev)}
                            className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left text-sm font-extrabold text-gray-950"
                            aria-expanded={detailsOpen}
                        >
                            詳細調整
                            <span className="text-lg leading-none">
                                {detailsOpen ? "-" : "+"}
                            </span>
                        </button>

                        {detailsOpen ? (
                            <div className="space-y-4 border-t border-gray-100 p-4">
                                <div>
                                    <p className="text-sm font-bold text-gray-900">
                                        画像枠
                                    </p>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        {FRAME_OPTIONS.map((option) => (
                                            <button
                                                key={option.value}
                                                type="button"
                                                onClick={() =>
                                                    onChange({
                                                        imageFrame:
                                                            option.value,
                                                    })
                                                }
                                                className={`rounded-xl px-3 py-2 text-sm font-semibold ${
                                                    values.imageFrame ===
                                                    option.value
                                                        ? "bg-green-600 text-white"
                                                        : "bg-gray-100 text-gray-700"
                                                }`}
                                            >
                                                {option.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div>
                                    <p className="text-sm font-bold text-gray-900">
                                        画像の見せ方
                                    </p>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        {FIT_OPTIONS.map((option) => (
                                            <button
                                                key={option.value}
                                                type="button"
                                                onClick={() =>
                                                    onChange({
                                                        imageFit: option.value,
                                                    })
                                                }
                                                className={`rounded-xl px-3 py-2 text-sm font-semibold ${
                                                    values.imageFit ===
                                                    option.value
                                                        ? "bg-green-600 text-white"
                                                        : "bg-gray-100 text-gray-700"
                                                }`}
                                            >
                                                {option.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div>
                                    <p className="text-sm font-bold text-gray-900">
                                        表示位置
                                    </p>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        {POSITION_OPTIONS.map((option) => (
                                            <button
                                                key={option.value}
                                                type="button"
                                                onClick={() =>
                                                    setPositionPreset(
                                                        option.value,
                                                    )
                                                }
                                                className={`rounded-xl px-3 py-2 text-sm font-semibold ${
                                                    values.imagePosition ===
                                                    option.value
                                                        ? "bg-green-600 text-white"
                                                        : "bg-gray-100 text-gray-700"
                                                }`}
                                            >
                                                {option.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="grid gap-3">
                                    <label className="text-sm font-bold text-gray-900">
                                        ズーム {values.imageZoom}%
                                        <input
                                            type="range"
                                            min={50}
                                            max={250}
                                            step={5}
                                            value={values.imageZoom}
                                            onChange={(event) =>
                                                onChange({
                                                    imageZoom: clampZoom(
                                                        Number(
                                                            event.target.value,
                                                        ),
                                                    ),
                                                })
                                            }
                                            className="mt-2 w-full accent-green-600"
                                        />
                                    </label>

                                    <label className="text-sm font-bold text-gray-900">
                                        横位置 {values.imagePositionX}%
                                        <input
                                            type="range"
                                            min={0}
                                            max={100}
                                            step={1}
                                            value={values.imagePositionX}
                                            onChange={(event) =>
                                                updatePosition(
                                                    Number(event.target.value),
                                                    values.imagePositionY,
                                                )
                                            }
                                            className="mt-2 w-full accent-green-600"
                                        />
                                    </label>

                                    <label className="text-sm font-bold text-gray-900">
                                        縦位置 {values.imagePositionY}%
                                        <input
                                            type="range"
                                            min={0}
                                            max={100}
                                            step={1}
                                            value={values.imagePositionY}
                                            onChange={(event) =>
                                                updatePosition(
                                                    values.imagePositionX,
                                                    Number(event.target.value),
                                                )
                                            }
                                            className="mt-2 w-full accent-green-600"
                                        />
                                    </label>
                                </div>
                            </div>
                        ) : null}
                    </div>
                </div>
            </div>
        </section>
    );
}
