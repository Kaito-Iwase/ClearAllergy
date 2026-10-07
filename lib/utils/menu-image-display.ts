export const MENU_IMAGE_FIT_VALUES = ["cover", "contain"] as const;
export const MENU_IMAGE_POSITION_VALUES = [
    "center",
    "top",
    "bottom",
    "left",
    "right",
] as const;
export const MENU_IMAGE_FRAME_VALUES = ["square", "wide"] as const;

export type MenuImageFit = (typeof MENU_IMAGE_FIT_VALUES)[number];
export type MenuImagePosition = (typeof MENU_IMAGE_POSITION_VALUES)[number];
export type MenuImageFrame = (typeof MENU_IMAGE_FRAME_VALUES)[number];

export const DEFAULT_MENU_IMAGE_FIT: MenuImageFit = "cover";
export const DEFAULT_MENU_IMAGE_POSITION: MenuImagePosition = "center";
export const DEFAULT_MENU_IMAGE_FRAME: MenuImageFrame = "square";
export const DEFAULT_MENU_IMAGE_ZOOM = 100;
export const DEFAULT_MENU_IMAGE_POSITION_X = 50;
export const DEFAULT_MENU_IMAGE_POSITION_Y = 50;

export const DEFAULT_SHOP_COVER_IMAGE_FIT: MenuImageFit = "cover";
export const DEFAULT_SHOP_COVER_IMAGE_POSITION: MenuImagePosition = "center";
export const DEFAULT_SHOP_COVER_IMAGE_FRAME: MenuImageFrame = "wide";
export const DEFAULT_SHOP_COVER_IMAGE_ZOOM = 100;
export const DEFAULT_SHOP_COVER_IMAGE_POSITION_X = 50;
export const DEFAULT_SHOP_COVER_IMAGE_POSITION_Y = 50;

const MIN_MENU_IMAGE_ZOOM = 50;
const MAX_MENU_IMAGE_ZOOM = 250;
const MIN_MENU_IMAGE_POSITION = 0;
const MAX_MENU_IMAGE_POSITION = 100;

export function parseMenuImageFit(value: unknown): MenuImageFit {
    return typeof value === "string" &&
        MENU_IMAGE_FIT_VALUES.includes(value as MenuImageFit)
        ? (value as MenuImageFit)
        : DEFAULT_MENU_IMAGE_FIT;
}

export function parseMenuImagePosition(value: unknown): MenuImagePosition {
    return typeof value === "string" &&
        MENU_IMAGE_POSITION_VALUES.includes(value as MenuImagePosition)
        ? (value as MenuImagePosition)
        : DEFAULT_MENU_IMAGE_POSITION;
}

export function parseMenuImageFrame(value: unknown): MenuImageFrame {
    return typeof value === "string" &&
        MENU_IMAGE_FRAME_VALUES.includes(value as MenuImageFrame)
        ? (value as MenuImageFrame)
        : DEFAULT_MENU_IMAGE_FRAME;
}

function parseBoundedInteger(
    value: unknown,
    fallback: number,
    min: number,
    max: number,
) {
    const parsed =
        typeof value === "number"
            ? value
            : typeof value === "string"
              ? Number(value)
              : Number.NaN;

    if (!Number.isFinite(parsed)) {
        return fallback;
    }

    return Math.min(max, Math.max(min, Math.round(parsed)));
}

export function parseMenuImageZoom(value: unknown) {
    return parseBoundedInteger(
        value,
        DEFAULT_MENU_IMAGE_ZOOM,
        MIN_MENU_IMAGE_ZOOM,
        MAX_MENU_IMAGE_ZOOM,
    );
}

export function parseMenuImagePositionPercent(value: unknown) {
    return parseBoundedInteger(
        value,
        DEFAULT_MENU_IMAGE_POSITION_X,
        MIN_MENU_IMAGE_POSITION,
        MAX_MENU_IMAGE_POSITION,
    );
}

export function getPositionPresetPercent(position: MenuImagePosition) {
    if (position === "top") return { x: 50, y: 0 };
    if (position === "bottom") return { x: 50, y: 100 };
    if (position === "left") return { x: 0, y: 50 };
    if (position === "right") return { x: 100, y: 50 };
    return { x: 50, y: 50 };
}

/** Signed movement at 100% position, including object-fit and zoom around that position. */
export function getImagePositionTravel(args: {
    frameWidth: number;
    frameHeight: number;
    imageWidth: number;
    imageHeight: number;
    fit: MenuImageFit;
    zoom: number;
}) {
    const { frameWidth, frameHeight, imageWidth, imageHeight, fit, zoom } = args;
    if (![frameWidth, frameHeight, imageWidth, imageHeight, zoom].every(
        (value) => Number.isFinite(value) && value > 0,
    )) return { x: 0, y: 0 };
    const fitScale = (fit === "contain" ? Math.min : Math.max)(
        frameWidth / imageWidth, frameHeight / imageHeight,
    );
    const scale = fitScale * zoom / 100;
    return { x: frameWidth - imageWidth * scale, y: frameHeight - imageHeight * scale };
}

export function getDraggedImagePosition(startPercent: number, deltaPixels: number, travelPixels: number) {
    // An axis exactly fitted to the frame has no movement available. Avoid division by zero.
    if (!Number.isFinite(deltaPixels) || !Number.isFinite(travelPixels) || Math.abs(travelPixels) < 0.01) {
        return startPercent;
    }
    return Math.min(100, Math.max(0, Math.round(startPercent + deltaPixels / travelPixels * 100)));
}
