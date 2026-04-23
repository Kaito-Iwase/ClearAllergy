// このコンポーネントは管理画面共通の「新規メニュー作成」ボタンです。
// 一覧画面や編集画面から同じ見た目で使えるよう、className も一緒に切り出しています。
// ロジックは持たず、/admin/menus/new への導線だけを担当します。

import Link from "next/link";

export const createMenuButtonClassName =
    "inline-flex items-center justify-center rounded-2xl bg-gray-900 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60";

export default function CreateMenuButton({
    disabled = false,
    href = "/admin/menus/new",
}: {
    disabled?: boolean;
    href?: string;
}) {
    if (disabled) {
        return (
            <span
                className={`${createMenuButtonClassName} cursor-not-allowed opacity-60`}
                aria-disabled="true"
            >
                ＋ 新規作成
            </span>
        );
    }

    return (
        <Link
            href={href}
            className={createMenuButtonClassName}
        >
            ＋ 新規作成
        </Link>
    );
}
