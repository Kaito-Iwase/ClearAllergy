import Link from "next/link";

export default function CreateMenuButton() {
    return (
        <Link
            href="/admin/menus/new"
            className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white"
        >
            ＋ 新規作成
        </Link>
    );
}
