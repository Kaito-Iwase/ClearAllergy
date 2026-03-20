import Link from "next/link";

export const createMenuButtonClassName =
    "inline-flex items-center justify-center rounded-2xl bg-gray-900 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60";

export default function CreateMenuButton() {
    return (
        <Link
            href="/admin/menus/new"
            className={createMenuButtonClassName}
        >
            ＋ 新規作成
        </Link>
    );
}
