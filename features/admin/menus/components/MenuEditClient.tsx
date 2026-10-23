"use client";

// Server Component から受け取った初期値を state に展開し、保存と画像アップロードを担当します。
// menuId を使って「どのメニューを更新するか」を API に伝えます。

import React from "react";
import SavedMenuPublicationPanel from "./SavedMenuPublicationPanel";
import { loadSavedMenu, type SavedMenuRevision } from "../saved-menu";
import type { SavedMenu } from "../schemas/menu-response";
import MenuFoodReviewHistory from "./MenuFoodReviewHistory";
import { isMenuPublicationCurrent } from "@/lib/allergens";
import { foodSnapshot, foodContentChanged, hasUnresolvedFoodIssue,  type FoodReviewSummary } from "../food-review";
import { getMenuSavePlan } from "../menu-save-plan";
import MenuSaveOutcomeNotice from "./MenuSaveOutcomeNotice";
import { useRouter } from "next/navigation";
import { useUnsavedMenuChanges } from "./useUnsavedMenuChanges";
import {
    getUnknownAllergenNames,
    type AllergenStatus,
} from "@/lib/allergens";
import { createMenuButtonClassName } from "@/features/admin/menus/components/CreateMenuButton";
import ImageCompositionEditor from "@/features/admin/menus/components/ImageCompositionEditor";
import { menuCreateResponseSchema, menuSaveResponseSchema } from "../schemas/menu-response";
import MenuPublishReadinessNotice from "@/features/admin/menus/components/MenuPublishReadinessNotice";
import MenuAllergenRegistrationGuide from "./MenuAllergenRegistrationGuide";
import {
    normalizeOptionalMenuText,
    parseMenuPriceYenInput,
} from "@/features/admin/menus/components/menu-form-values";
import {
    getApiErrorMessage,
    getThrownErrorMessage,
} from "@/lib/utils/api-error-message";
import {
    DEFAULT_MENU_IMAGE_FIT,
    DEFAULT_MENU_IMAGE_FRAME,
    DEFAULT_MENU_IMAGE_POSITION,
    DEFAULT_MENU_IMAGE_POSITION_X,
    DEFAULT_MENU_IMAGE_POSITION_Y,
    DEFAULT_MENU_IMAGE_ZOOM,
    type MenuImageFit,
    type MenuImageFrame,
    type MenuImagePosition,
} from "@/lib/utils/menu-image-display";

type Allergen = {
    slug: string;
    nameJa: string;
    nameEn: string;
    sortOrder: number;
};

type UploadResponse = {
    url?: string;
    pathname?: string;
    error?: string;
};

const SAVE_ERROR_MESSAGE =
    "保存結果を確認できません。入力を保持したまま、最新の保存内容を確認してください。";
const CREATE_ERROR_MESSAGE =
    "作成結果を確認できません。保存済みのメニューがないか確認してください。";
const UPLOAD_ERROR_MESSAGE =
    "画像のアップロードに失敗しました。時間をおいてもう一度お試しください。";

export default function MenuEditClient(props: {
    menuId: string;
    initialVersion?: number;
    initialFoodVersion?: number;
    initialReviewedFoodVersion?: number | null;
    initialPublicationConfirmedFoodVersion?: number | null;
    initialFoodReviews?: FoodReviewSummary[];
    initialName: string;
    initialDescription: string | null;
    initialPriceYen: number | null;
    initialCategory: string | null;
    initialIngredients: string | null;
    initialPrecaution: string | null;
    initialImageUrl: string | null;
    initialImageFrame: MenuImageFrame;
    initialImageFit: MenuImageFit;
    initialImagePosition: MenuImagePosition;
    initialImageZoom: number;
    initialImagePositionX: number;
    initialImagePositionY: number;
    initialIsPublished: boolean;
    allergens: Allergen[];
    initialStatusBySlug: Record<string, AllergenStatus>;
    readOnly?: boolean;
    readOnlyPreview?: boolean;
    readOnlyCreateHref?: string;
    initialConfirmationSnapshot?: SavedMenu;
}) {
    const router = useRouter();

    const {
        menuId,
        initialName,
        initialDescription,
        initialPriceYen,
        initialCategory,
        initialIngredients,
        initialPrecaution,
        initialImageUrl,
        initialImageFrame,
        initialImageFit,
        initialImagePosition,
        initialImageZoom,
        initialImagePositionX,
        initialImagePositionY,
        initialIsPublished,
        allergens,
        initialStatusBySlug,
        readOnly = false,
        readOnlyPreview = false,
        readOnlyCreateHref,
    } = props;

    const [name, setName] = React.useState(initialName);
    const [description, setDescription] = React.useState(
        initialDescription ?? "",
    );
    const [category, setCategory] = React.useState(initialCategory ?? "");
    const [ingredients, setIngredients] = React.useState(
        initialIngredients ?? "",
    );
    const [precaution, setPrecaution] = React.useState(initialPrecaution ?? "");
    const [imageUrl, setImageUrl] = React.useState(initialImageUrl ?? "");
    const [imageFrame, setImageFrame] = React.useState<MenuImageFrame>(
        initialImageFrame ?? DEFAULT_MENU_IMAGE_FRAME,
    );
    const [imageFit, setImageFit] = React.useState<MenuImageFit>(
        initialImageFit ?? DEFAULT_MENU_IMAGE_FIT,
    );
    const [imagePosition, setImagePosition] =
        React.useState<MenuImagePosition>(
            initialImagePosition ?? DEFAULT_MENU_IMAGE_POSITION,
        );
    const [imageZoom, setImageZoom] = React.useState(
        initialImageZoom ?? DEFAULT_MENU_IMAGE_ZOOM,
    );
    const [imagePositionX, setImagePositionX] = React.useState(
        initialImagePositionX ?? DEFAULT_MENU_IMAGE_POSITION_X,
    );
    const [imagePositionY, setImagePositionY] = React.useState(
        initialImagePositionY ?? DEFAULT_MENU_IMAGE_POSITION_Y,
    );

    const [priceYenInput, setPriceYenInput] = React.useState(
        initialPriceYen === null ? "" : String(initialPriceYen),
    );

    const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
    const [localPreviewUrl, setLocalPreviewUrl] = React.useState<string | null>(
        null,
    );

    const initialUnknownAllergenNames = getUnknownAllergenNames({
        allergens,
        statusBySlug: initialStatusBySlug,
    });
    const [isPublished, setIsPublished] = React.useState(
        initialIsPublished && initialUnknownAllergenNames.length === 0,
    );
    const [statusBySlug, setStatusBySlug] =
        React.useState<Record<string, AllergenStatus>>(initialStatusBySlug);

    const [saving, setSaving] = React.useState(false);
    const [creating, setCreating] = React.useState(false);
    const [uploading, setUploading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [conflict, setConflict] = React.useState(false);
    const [nameInvalid, setNameInvalid] = React.useState(false);
    const [saved, setSaved] = React.useState(false);
    const [notice, setNotice] = React.useState<string | null>(null);
    const [confirmation, setConfirmation] = React.useState<SavedMenu | null>(props.initialConfirmationSnapshot ?? null);
    const [confirmationOpen, setConfirmationOpen] = React.useState(Boolean(props.initialConfirmationSnapshot && !props.initialConfirmationSnapshot.isPublished));
    const [confirmationLoading, setConfirmationLoading] = React.useState(false);
    const [confirmationError, setConfirmationError] = React.useState<string | null>(null);
    const [confirmationSavedNow, setConfirmationSavedNow] = React.useState(Boolean(props.initialConfirmationSnapshot));
    const confirmationRevision = React.useRef<SavedMenuRevision | undefined>(undefined);
    const operationPending = React.useRef(false);
    const formFields = React.useRef<HTMLFieldSetElement>(null);
    const uploadedFile = React.useRef<{ file: File; url: string } | null>(null);
    const creationOperation = React.useRef<string | null>(null);
    const [version, setVersion] = React.useState(props.initialVersion ?? 0);
    const [savedFoodVersion, setSavedFoodVersion] = React.useState(props.initialFoodVersion ?? 0);
    const [publicationCurrent, setPublicationCurrent] = React.useState(isMenuPublicationCurrent({ foodVersion: props.initialFoodVersion ?? 0, publicationConfirmedFoodVersion: props.initialPublicationConfirmedFoodVersion }));
    const [reviewHistory, setReviewHistory] = React.useState(props.initialFoodReviews ?? []);
    const [savedFoodSnapshot, setSavedFoodSnapshot] = React.useState(() => foodSnapshot({ name: initialName, description: initialDescription, category: initialCategory, ingredients: initialIngredients, precaution: initialPrecaution, imageUrl: initialImageUrl }, allergens, initialStatusBySlug));
    const currentFoodSnapshot = foodSnapshot({ name, description, category, ingredients, precaution, imageUrl }, allergens, statusBySlug);
    const foodChanged = selectedFile !== null || foodContentChanged(savedFoodSnapshot, currentFoodSnapshot);
    const unknownAllergenNames = React.useMemo(
        () => getUnknownAllergenNames({ allergens, statusBySlug }),
        [allergens, statusBySlug],
    );
    const unresolvedIssue = hasUnresolvedFoodIssue(savedFoodVersion, reviewHistory[0]);
    const savePlan = getMenuSavePlan({ name, allergens, statusBySlug, requestedIsPublished: isPublished,
        foodChanged, publicationCurrent, unresolved: unresolvedIssue });
    const { canPublish } = savePlan;
    const allergenRows = React.useRef(new Map<string, HTMLDivElement>());
    function findNextUnknown() {
        const next = allergens.find((allergen) => (statusBySlug[allergen.slug] ?? "UNKNOWN") === "UNKNOWN");
        if (next) {
            const row = allergenRows.current.get(next.slug);
            row?.scrollIntoView({ block: "center" });
            row?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
        }
    }
    const draftValues = { name, description, priceYenInput, category, ingredients, precaution,
        imageUrl, imageFrame, imageFit, imagePosition, imageZoom, imagePositionX, imagePositionY,
        isPublished, statusBySlug };
    const currentDraft = JSON.stringify(draftValues);
    const [savedDraft, setSavedDraft] = React.useState(currentDraft);
    const [savedIsPublished, setSavedIsPublished] = React.useState(initialIsPublished);
    const hasUnsavedChanges = currentDraft !== savedDraft || selectedFile !== null;
    useUnsavedMenuChanges(hasUnsavedChanges);

    function finishConfirmation(unknown = false, edit = false) {
        setConfirmationOpen(false);
        setConfirmation(null);
        // Wait until the fieldset is enabled before returning focus to an input.
        requestAnimationFrame(() => {
            if (unknown) findNextUnknown();
            else formFields.current?.querySelector<HTMLInputElement>(edit ? "#edit-menu-field-1" : "button[data-save-menu]")?.focus();
        });
    }

    async function openSavedConfirmation(expected: SavedMenuRevision, savedNow = false) {
        if (confirmationLoading) return;
        confirmationRevision.current = expected;
        setConfirmationSavedNow(savedNow);
        setConfirmation(null); setConfirmationOpen(true); setConfirmationLoading(true); setConfirmationError(null);
        try {
            const menu = await loadSavedMenu(menuId, expected);
            if (menu.allergens.length !== allergens.length || menu.allergens.some(a => !allergens.some(local => local.slug === a.slug))) {
                throw new Error("品目マスタが更新されています。最新内容を別タブで確認してから編集してください。");
            }
            setConfirmation(menu);
        } catch (cause) { setConfirmationError(getThrownErrorMessage(cause, "保存済み内容を読み込めませんでした。")); }
        finally { setConfirmationLoading(false); }
    }


    React.useEffect(() => {
        // 作成した Object URL は不要になったら解放し、メモリリークを防ぎます。
        return () => {
            if (localPreviewUrl) {
                URL.revokeObjectURL(localPreviewUrl);
            }
        };
    }, [localPreviewUrl]);

    function setOne(slug: string, status: AllergenStatus) {
        setSaved(false);
        setStatusBySlug((prev) => ({ ...prev, [slug]: status }));
        if (status === "UNKNOWN") {
            setIsPublished(false);
        }
    }

    function onSelectImage(e: React.ChangeEvent<HTMLInputElement>) {
        // 保存前に画像を確認できるよう、ローカルプレビューを作ります。
        const file = e.target.files?.[0];
        if (!file) {
            return;
        }

        if (!file.type.startsWith("image/")) {
            setError("画像ファイルを選択してください。");
            return;
        }

        if (localPreviewUrl) {
            URL.revokeObjectURL(localPreviewUrl);
        }

        const previewUrl = URL.createObjectURL(file);
        setSelectedFile(file);
        setLocalPreviewUrl(previewUrl);
        setError(null);
    }

    async function uploadSelectedImage(): Promise<string | null> {
        // 新しい画像が選ばれていない場合は、既存 URL をそのまま使います。
        if (!selectedFile) {
            return normalizeOptionalMenuText(imageUrl);
        }
        if (uploadedFile.current?.file === selectedFile) return uploadedFile.current.url;

        setUploading(true);

        try {
            const formData = new FormData();
            formData.append("file", selectedFile);

            // 画像アップロード API から返ってきた URL を、そのままメニュー更新に使います。
            const res = await fetch("/api/admin/upload-menu-image", {
                method: "POST",
                body: formData,
            });

            if (!res.ok) {
                throw new Error(
                    await getApiErrorMessage(res, UPLOAD_ERROR_MESSAGE),
                );
            }

            const data = (await res.json().catch(() => null)) as
                | UploadResponse
                | null;

            if (!data?.url) {
                throw new Error(UPLOAD_ERROR_MESSAGE);
            }

            setImageUrl(data.url);
            uploadedFile.current = { file: selectedFile, url: data.url };
            return data.url;
        } finally {
            setUploading(false);
        }
    }

    async function saveMenuAction(action: "publish" | "resolve") {
        if (operationPending.current || saving || uploading || creating || readOnly || conflict) return;
        if (hasUnsavedChanges) { setError("変更を保存してから公開してください。"); return; }
        if (action === "publish" && (!confirmation || confirmation.version !== version || confirmation.foodVersion !== savedFoodVersion)) return;
        operationPending.current = true;
        setConfirmationError(null);
        const actionErrorMessage = action === "publish"
            ? "公開結果を確認できません。保存済み内容は保持されています。"
            : SAVE_ERROR_MESSAGE;
        setError(null); setNotice(null); setSaved(false); setSaving(true);
        try {
            const response = await fetch(`/api/admin/menus/${menuId}`, {
                method: "PUT", headers: { "Content-Type": "application/json" },
                body: JSON.stringify(action === "resolve" ? { expectedVersion: version,
                    foodIssueResolution: { foodReviewId: reviewHistory[0]?.id, foodVersion: savedFoodVersion } }
                    : { expectedVersion: version, publicationAction: "publish" }),
            });
            if (!response.ok) { setConflict(response.status === 409); throw new Error(await getApiErrorMessage(response, actionErrorMessage)); }
            const result = menuSaveResponseSchema.safeParse(await response.json().catch(() => null));
            if (!result.success || result.data.menu.id !== menuId || result.data.menu.version <= version) {
                throw new Error(actionErrorMessage);
            }
            const data = result.data;
            if (action === "publish" && !data.menu.isPublished) throw new Error("公開結果を確認できませんでした。保存内容は保持されています。最新状態を確認してください。");
            setSavedFoodVersion(data.menu.foodVersion); setVersion(data.menu.version); setIsPublished(data.menu.isPublished); setSavedIsPublished(data.menu.isPublished);
            setPublicationCurrent(isMenuPublicationCurrent(data.menu)); setReviewHistory(data.menu.foodReviews); setConflict(false);
            setSavedDraft(previous => JSON.stringify({ ...JSON.parse(previous), isPublished: data.menu.isPublished }));
            setSaved(true);
            if (action === "publish") { setConfirmationOpen(false); setConfirmation(null); setNotice("保存済み内容を公開しました。"); }
            if (action === "resolve") setNotice("未解決事項の解消を記録しました。保存済み内容を見直して、別に公開してください。");
            if (data.publicRefreshPending) setNotice("保存は完了しましたが、公開表示の更新処理が未完了です。再保存せず、公開表示を確認してください。");
            router.refresh();
        } catch (error) {
            const detail = getThrownErrorMessage(error, actionErrorMessage);
            const message = action === "publish" && !detail.startsWith(actionErrorMessage)
                ? `${actionErrorMessage} ${detail}` : detail;
            setError(message);
            if (action === "publish") setConfirmationError(message);
        }
        finally { setSaving(false); operationPending.current = false; }
    }

    async function onSave() {
        if (operationPending.current || saving || uploading || creating || confirmationOpen) return;
        setError(null);
        setNameInvalid(false);
        setSaved(false);
        setNotice(null);

        if (readOnly) {
            setError(
                "ポートフォリオ公開版のため、入力内容は保存されません。",
            );
            setSaving(false);
            return;
        }

        if (!name.trim()) {
            setNameInvalid(true);
            setError("メニュー名は必須です。");
            return;
        }
        operationPending.current = true;
        setSaving(true);
        try {
            const trimmedName = name.trim();
            if (!trimmedName) {
                throw new Error("メニュー名は必須です。");
            }

            const priceYen = parseMenuPriceYenInput(priceYenInput);
            const uploadedImageUrl = await uploadSelectedImage();

            const body = {
                expectedVersion: version,
                name: trimmedName,
                description: normalizeOptionalMenuText(description),
                priceYen,
                category: normalizeOptionalMenuText(category),
                ingredients: normalizeOptionalMenuText(ingredients),
                precaution: normalizeOptionalMenuText(precaution),
                imageUrl: uploadedImageUrl,
                imageFrame,
                imageFit,
                imagePosition,
                imageZoom,
                imagePositionX,
                imagePositionY,
                isPublished: savePlan.willPublish,
                allergenStatusBySlug: statusBySlug,
            };

            // 保存処理そのものは API に任せ、DB 更新ルールをサーバー側に集約します。
            const res = await fetch(`/api/admin/menus/${menuId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            }).catch(() => { throw new Error(SAVE_ERROR_MESSAGE); });

            if (!res.ok) {
                setConflict(res.status === 409);
                throw new Error(
                    await getApiErrorMessage(res, SAVE_ERROR_MESSAGE),
                );
            }

            const result = menuSaveResponseSchema.safeParse(await res.json().catch(() => null));
            if (!result.success || result.data.menu.id !== menuId || result.data.menu.version <= version) {
                throw new Error("保存結果を確認できませんでした。再読み込みして保存状態を確認してください。");
            }
            const data = result.data;
            setIsPublished(data.menu.isPublished);
            setConflict(false);
            setVersion(data.menu.version);
            setPublicationCurrent(isMenuPublicationCurrent(data.menu));
            setReviewHistory(data.menu.foodReviews);
            setSavedFoodVersion(data.menu.foodVersion);
            setSavedFoodSnapshot({ ...currentFoodSnapshot, imageUrl: data.menu.imageUrl ?? null });
            setSavedIsPublished(data.menu.isPublished);
            setSavedDraft(JSON.stringify({ ...draftValues, isPublished: data.menu.isPublished,
                imageUrl: typeof data.menu.imageUrl === "string" ? data.menu.imageUrl : "" }));
            if (typeof data.menu.imageUrl === "string" || data.menu.imageUrl === null) {
                setImageUrl(data.menu.imageUrl ?? "");
            }
            // 成功レスポンスを確認してから保存済み表示にします。
            setSaved(true);
            if (data.publicRefreshPending) setNotice("保存は完了しましたが、公開表示の更新処理が未完了です。再保存せず、公開表示を確認してください。");
            setSelectedFile(null);
            if (!data.menu.isPublished) await openSavedConfirmation(data.menu, true);
            else router.refresh();
        } catch (e) {
            setError(getThrownErrorMessage(e, SAVE_ERROR_MESSAGE));
        } finally {
            setSaving(false);
            operationPending.current = false;
        }
    }

    async function handleCreateMenu() {
        if (hasUnsavedChanges && !window.confirm("未保存の変更があります。変更を保存せず、新しいメニューの作成へ進みますか？")) return;
        // 編集中でも「次の新規メニューを作る」導線を置き、入力作業を続けやすくします。
        setCreating(true);
        setError(null);
        setSaved(false);

        if (readOnly) {
            if (readOnlyCreateHref) {
                router.push(readOnlyCreateHref);
                setCreating(false);
                return;
            }

            setError(
                "ポートフォリオ公開版のため、メニュー作成はできません。",
            );
            setCreating(false);
            return;
        }

        try {
            // 操作IDだけを送り、再送でも同じ下書きを返せるようにします。
            const res = await fetch("/api/admin/menus", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ operationId: creationOperation.current ??= crypto.randomUUID() }),
            }).catch(() => { throw new Error(CREATE_ERROR_MESSAGE); });

            if (!res.ok) {
                throw new Error(
                    await getApiErrorMessage(res, CREATE_ERROR_MESSAGE),
                );
            }

            const result = menuCreateResponseSchema.safeParse(await res.json().catch(() => null));
            if (!result.success) {
                throw new Error(CREATE_ERROR_MESSAGE);
            }
            const data = result.data;

            if (data.publicRefreshPending) window.alert("作成は完了しましたが、公開表示の反映は未確認です。再作成せず、保存済みメニューを確認してください。");
            router.push(`/admin/menus/${data.id}/edit`);
        } catch (e) {
            setError(getThrownErrorMessage(e, CREATE_ERROR_MESSAGE));
        } finally {
            setCreating(false);
        }
    }

    async function stopPublication() {
        if (readOnly || saving || uploading || creating) return;
        if (!window.confirm(`「${name}」の公開を停止します。未保存の入力内容は送信しません。`)) return;
        setSaving(true); setError(null); setNotice(null); setSaved(false);
        try {
            const response = await fetch(`/api/admin/menus/${menuId}/stop`, { method: "POST" }).catch(() => { throw new Error("公開停止の結果を確認できません。最新の公開状態を確認してください。"); });
            if (!response.ok) throw new Error(await getApiErrorMessage(response, "公開停止を確認できませんでした。"));
            const result = await response.json().catch(() => null);
            if (result?.ok !== true) throw new Error("公開停止を確認できませんでした。");
            setIsPublished(false); setSavedIsPublished(false);
            // Do not attach an old full form to the newer version returned by stop.
            setNotice(result.publicRefreshPending ? "公開停止を保存しましたが、公開表示の更新処理が未完了です。" : "公開停止を保存しました。編集を続ける前に最新内容を確認してください。");
            router.refresh();
        } catch (error) { setError(getThrownErrorMessage(error, "公開停止を確認できませんでした。")); }
        finally { setSaving(false); }
    }

    return (
        <div className="min-w-0 space-y-6">
        {confirmationOpen && <SavedMenuPublicationPanel menu={confirmation} loading={confirmationLoading}
            error={confirmationError} busy={saving && !confirmationLoading} savedNow={confirmationSavedNow} blocked={conflict}
            onPublish={() => void saveMenuAction("publish")} onClose={() => finishConfirmation()}
            onEdit={unknown => finishConfirmation(unknown, true)}
            onRetry={() => { if (confirmationRevision.current) void openSavedConfirmation(confirmationRevision.current, confirmationSavedNow); }} />}
        <fieldset ref={formFields} disabled={saving || uploading || creating || confirmationOpen} className="min-w-0 space-y-6"
            onChangeCapture={() => setSaved(false)}>
            <legend className="sr-only">メニュー編集</legend>
            {notice && <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{notice}</p>}
            <button type="button" onClick={stopPublication} disabled={readOnly} className="min-h-11 rounded-xl border border-red-300 px-4 py-2 text-sm font-semibold text-red-800 disabled:opacity-60">公開を停止する</button>
            <div className="rounded-2xl bg-white p-4 shadow-sm sm:p-5">
                <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="font-bold text-gray-900">基本情報</div>

                    <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
                        <button
                            type="button"
                            onClick={handleCreateMenu}
                            disabled={
                                (readOnly && !readOnlyPreview) ||
                                creating ||
                                saving ||
                                uploading
                            }
                            className={`${createMenuButtonClassName} min-h-11 w-full sm:w-auto`}
                        >
                            {readOnly && !readOnlyPreview
                                ? "閲覧専用"
                                : readOnly
                                  ? "保存されない新規作成デモ"
                                : creating
                                  ? "作成中..."
                                  : "＋ 新しいメニューを作る"}
                        </button>



                        {!savedIsPublished && <button type="button" onClick={() => void openSavedConfirmation({ version, foodVersion: savedFoodVersion })}
                            disabled={readOnly || saving || uploading || creating || conflict || hasUnsavedChanges || !canPublish}
                            className="min-h-11 w-full rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 sm:w-auto">
                            公開する{readOnly ? "（デモ）" : ""}
                        </button>}
                        <button
                            type="button"
                            data-save-menu
                            onClick={onSave}
                            disabled={
                                (readOnly && !readOnlyPreview) ||
                                saving ||
                                creating ||
                                uploading
                            }
                            className="min-h-11 w-full rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 sm:w-auto"
                        >
                            {readOnly && !readOnlyPreview
                                ? "閲覧専用"
                                : readOnly
                                  ? "保存されないデモ操作"
                                : saving
                                ? "保存中..."
                                : uploading
                                  ? "画像アップロード中..."
                                  : "保存する"}
                        </button>
                    </div>
                </div>

                <p role="status" className="mt-3 text-sm font-semibold text-gray-800">
                    保存済みの公開設定：{savedIsPublished ? "公開" : "非公開"}
                    {hasUnsavedChanges ? " ／ 未保存の変更があります" : ""}
                </p>
                {error && (
                    <div id="edit-menu-error" role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                        {error}
                        {conflict && <p className="mt-2"><a href={`/admin/menus/${menuId}/edit`} target="_blank" rel="noopener noreferrer" className="font-semibold underline">最新内容を別タブで確認する</a>（このタブの入力は残ります）</p>}
                    </div>
                )}

                {saved && !hasUnsavedChanges && (
                    <div role="status" className="mt-3 rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
                        保存しました。公開状態：{savedIsPublished ? "公開" : "非公開"}。
                        公開操作：{publicationCurrent ? "保存済みの食品内容に対応" : "保存済み内容から別に公開が必要"}。
                    </div>
                )}

                <MenuSaveOutcomeNotice plan={savePlan} unknownCount={unknownAllergenNames.length} totalCount={allergens.length} />

                <MenuPublishReadinessNotice
                    unknownAllergenNames={unknownAllergenNames}
                    totalAllergenCount={allergens.length}
                    onFindUnknown={findNextUnknown}
                />

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <div>
                        <label htmlFor="edit-menu-field-1" className="mb-1 block text-sm font-medium text-gray-700">
                            メニュー名
                        </label>
                        <input id="edit-menu-field-1"
                            aria-required="true"
                            aria-invalid={nameInvalid}
                            aria-describedby={nameInvalid && error ? "edit-menu-error" : undefined}
                            maxLength={120}
                            value={name}
                            onChange={(e) => { setName(e.target.value); setNameInvalid(false); }}
                            className="w-full rounded-xl border border-gray-300 px-3 py-2 outline-none focus:border-green-500"
                            placeholder="例：米粉パンケーキ"
                        />
                    </div>

                    <div>
                        <label htmlFor="edit-menu-field-2" className="mb-1 block text-sm font-medium text-gray-700">
                            価格（税込・円）
                        </label>
                        <input id="edit-menu-field-2"
                            type="number"
                            inputMode="numeric"
                            min={0}
                            step={1}
                            value={priceYenInput}
                            onChange={(e) => setPriceYenInput(e.target.value)}
                            className="w-full rounded-xl border border-gray-300 px-3 py-2 outline-none focus:border-green-500"
                            placeholder="例：1200"
                        />
                        <p className="mt-1 text-xs text-gray-500">
                            未入力なら価格なしとして保存します。
                        </p>
                    </div>
                </div>

                <div className="mt-4">
                    <label htmlFor="edit-menu-field-3" className="mb-1 block text-sm font-medium text-gray-700">
                        説明
                    </label>
                    <textarea id="edit-menu-field-3"
                        maxLength={2000}
                            value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        rows={4}
                        className="w-full rounded-xl border border-gray-300 px-3 py-2 outline-none focus:border-green-500"
                        placeholder="例：米粉を使ったふわふわ食感のパンケーキです。"
                    />
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <div>
                        <label htmlFor="edit-menu-field-4" className="mb-1 block text-sm font-medium text-gray-700">
                            カテゴリ
                        </label>
                        <input id="edit-menu-field-4"
                            maxLength={120}
                            value={category}
                            onChange={(e) => setCategory(e.target.value)}
                            className="w-full rounded-xl border border-gray-300 px-3 py-2 outline-none focus:border-green-500"
                            placeholder="例：デザート"
                        />
                    </div>
                </div>

                <div className="mt-4">
                    <label htmlFor="edit-menu-field-5" className="mb-1 block text-sm font-medium text-gray-700">
                        🧺 原材料名
                    </label>
                    <textarea id="edit-menu-field-5"
                        maxLength={5000}
                            value={ingredients}
                        onChange={(e) => setIngredients(e.target.value)}
                        rows={5}
                        className="w-full rounded-xl border border-gray-300 px-3 py-2 outline-none focus:border-green-500"
                        placeholder="例：小麦粉、卵、牛乳、砂糖、バター"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                        未入力でも保存・公開できますが、できるだけ入力をおすすめします。
                    </p>
                </div>

                <div className="mt-4">
                    <label htmlFor="edit-menu-field-6" className="mb-1 block text-sm font-medium text-gray-700">
                        注意書き
                    </label>
                    <textarea id="edit-menu-field-6" aria-describedby="edit-menu-precaution-help"
                        maxLength={2000}
                            value={precaution}
                        onChange={(e) => setPrecaution(e.target.value)}
                        rows={3}
                        className="w-full rounded-xl border border-gray-300 px-3 py-2 outline-none focus:border-green-500"
                        placeholder="例：仕入れ品に「乳を扱う製造ライン」の注意表示があります。小麦を使う料理と揚げ油を共用しています。"
                    />
                    <p id="edit-menu-precaution-help" className="mt-1 text-xs leading-5 text-gray-600">
                        注意の対象品目・理由・仕入先の注意内容を記載してください。注意書きだけでは品目別の状態は変わりません。
                    </p>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <div>
                        <label htmlFor="edit-menu-field-7" className="mb-1 block text-sm font-medium text-gray-700">
                            食品画像ファイル
                        </label>
                        <input id="edit-menu-field-7"
                            type="file"
                            accept="image/*"
                            onChange={onSelectImage}
                            className="block w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-700 file:mr-4 file:rounded-lg file:border-0 file:bg-gray-100 file:px-4 file:py-2 file:font-semibold file:text-gray-700"
                        />
                        <p className="mt-1 text-xs text-gray-500">
                            保存時に画像をアップロードしてURLを保存します。
                        </p>
                    </div>

                    <div>
                        <label htmlFor="edit-menu-field-8" className="mb-1 block text-sm font-medium text-gray-700">
                            画像URL
                        </label>
                        <input id="edit-menu-field-8"
                            type="url"
                            maxLength={2048}
                            value={imageUrl}
                            onChange={(e) => setImageUrl(e.target.value)}
                            className="w-full rounded-xl border border-gray-300 px-3 py-2 outline-none focus:border-green-500"
                            placeholder="アップロード後に自動入力されます"
                        />
                    </div>
                </div>

                {(localPreviewUrl || imageUrl.trim()) && (
                    <ImageCompositionEditor
                        imageSrc={localPreviewUrl || imageUrl.trim()}
                        imageAlt="メニュー画像プレビュー"
                        subjectName={name}
                        subjectKind="menu"
                        values={{
                            imageFrame,
                            imageFit,
                            imagePosition,
                            imageZoom,
                            imagePositionX,
                            imagePositionY,
                        }}
                        initialValues={{
                            imageFrame: initialImageFrame,
                            imageFit: initialImageFit,
                            imagePosition: initialImagePosition,
                            imageZoom: initialImageZoom,
                            imagePositionX: initialImagePositionX,
                            imagePositionY: initialImagePositionY,
                        }}
                        onChange={(next) => {
                            if (saving || uploading) return;
                            setSaved(false);
                            if (next.imageFrame) setImageFrame(next.imageFrame);
                            if (next.imageFit) setImageFit(next.imageFit);
                            if (next.imagePosition) {
                                setImagePosition(next.imagePosition);
                            }
                            if (typeof next.imageZoom === "number") {
                                setImageZoom(next.imageZoom);
                            }
                            if (typeof next.imagePositionX === "number") {
                                setImagePositionX(next.imagePositionX);
                            }
                            if (typeof next.imagePositionY === "number") {
                                setImagePositionY(next.imagePositionY);
                            }
                        }}
                    />
                )}

            </div>

            <div className="rounded-2xl bg-white p-4 shadow-sm sm:p-5">
                <div className="font-bold text-gray-900">
                    アレルゲン{allergens.length}品目
                </div>
                <p className="mt-1 text-sm text-gray-600">
                    各品目について「未設定 / 含む / 原材料に含まない登録 / 含む可能性あり・要確認」を選択してください。
                </p>

                <MenuPublishReadinessNotice
                    unknownAllergenNames={unknownAllergenNames}
                    totalAllergenCount={allergens.length}
                    onFindUnknown={findNextUnknown}
                />
                    {hasUnsavedChanges && <p className="mt-2 text-sm">公開する前に、変更を保存してください。</p>}
                    {unresolvedIssue && <section aria-label="保存済みの未解決事項" className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm">
                            <p className="font-bold">保存済みの未解決事項</p>
                            <p className="mt-2 whitespace-pre-wrap break-words">{reviewHistory[0].unresolvedIssues}</p>
                            <p className="mt-2">実際に確認・対応してから「この内容は解消した」を操作してください。旧記録は保持し、公開は別に操作します。アレルゲンの登録状態は変わりません。</p>
                            <button type="button" onClick={() => void saveMenuAction("resolve")}
                                disabled={readOnly || saving || uploading || creating || conflict || hasUnsavedChanges}
                                className="mt-2 min-h-11 rounded-xl border border-amber-700 px-4 py-2 font-semibold disabled:opacity-60">この内容は解消した</button>
                            {hasUnsavedChanges && <p className="mt-2">変更を保存してから操作してください。</p>}
                        </section>}
                    <MenuFoodReviewHistory history={reviewHistory} />
                    <MenuAllergenRegistrationGuide />

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                    {allergens.map((a) => {
                        const current = statusBySlug[a.slug] ?? "UNKNOWN";

                        return (
                            <div
                                key={a.slug}
                                ref={(element) => { if (element) allergenRows.current.set(a.slug, element); else allergenRows.current.delete(a.slug); }}
                                role="group"
                                aria-label={a.nameJa}
                                className="rounded-2xl border border-gray-200 p-3 sm:p-4"
                            >
                                <div className="mb-3">
                                    <div className="font-semibold text-gray-900">
                                        {a.nameJa}
                                    </div>
                                    <div className="text-xs text-gray-500">
                                        {a.nameEn}
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        type="button" aria-pressed={current === "UNKNOWN"}
                                        onClick={() => setOne(a.slug, "UNKNOWN")}
                                        className={`min-h-11 w-full rounded-xl px-3 py-2 text-sm font-medium ${
                                            current === "UNKNOWN"
                                                ? "bg-gray-700 text-white"
                                                : "bg-gray-100 text-gray-700"
                                        }`}
                                    >
                                        未設定
                                    </button>

                                    <button
                                        type="button" aria-pressed={current === "CONTAINS"}
                                        onClick={() =>
                                            setOne(a.slug, "CONTAINS")
                                        }
                                        className={`min-h-11 w-full rounded-xl px-3 py-2 text-sm font-medium ${
                                            current === "CONTAINS"
                                                ? "bg-red-600 text-white"
                                                : "bg-gray-100 text-gray-700"
                                        }`}
                                    >
                                        含む
                                    </button>

                                    <button
                                        type="button" aria-pressed={current === "FREE"}
                                        onClick={() => setOne(a.slug, "FREE")}
                                        className={`min-h-11 w-full rounded-xl px-3 py-2 text-sm font-medium ${
                                            current === "FREE"
                                                ? "bg-green-600 text-white"
                                                : "bg-gray-100 text-gray-700"
                                        }`}
                                    >
                                        原材料に含まない登録
                                    </button>

                                    <button
                                        type="button" aria-pressed={current === "MAY_CONTAIN"}
                                        onClick={() =>
                                            setOne(a.slug, "MAY_CONTAIN")
                                        }
                                        className={`min-h-11 w-full rounded-xl px-3 py-2 text-sm font-medium ${
                                            current === "MAY_CONTAIN"
                                                ? "bg-yellow-500 text-white"
                                                : "bg-gray-100 text-gray-700"
                                        }`}
                                    >
                                        含む可能性あり・要確認
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div className="mt-5">
                    <button
                        type="button"
                        onClick={onSave}
                        disabled={
                            (readOnly && !readOnlyPreview) ||
                            saving ||
                            creating ||
                            uploading
                        }
                        className="min-h-11 w-full rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 sm:w-auto"
                    >
                        {readOnly && !readOnlyPreview
                            ? "閲覧専用"
                            : readOnly
                              ? "保存されないデモ操作"
                            : saving
                            ? "保存中..."
                            : uploading
                              ? "画像アップロード中..."
                              : "この内容で保存する"}
                    </button>
                </div>
            </div>
        </fieldset>
        </div>
    );
}
