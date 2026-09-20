// seed が作成する専用アカウントだけを閲覧デモのデータ所有者として扱います。
// 店舗名は編集できる表示情報なので、データ公開の判定には使用しません。
export const DEMO_USER_EMAIL = "demo@clearallergy.local";
export const DEMO_SHOP_WHERE = {
    user: { is: { email: DEMO_USER_EMAIL } },
} as const;
