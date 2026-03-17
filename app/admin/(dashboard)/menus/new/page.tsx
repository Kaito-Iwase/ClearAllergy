// app/(admin)/admin/menus/new/page.tsx

import Link from "next/link";
import NewMenuForm from "./NewMenuForm";

export default function AdminMenuNewPage() {
    return (
        <main className="mx-auto w-full max-w-2xl p-6">
            <nav className="mb-4 text-sm text-neutral-500">
                <Link href="/admin/menus" className="hover:text-neutral-900">
                    メニュー一覧
                </Link>
                <span className="mx-2">/</span>
                <span className="font-medium text-neutral-900">新規作成</span>
            </nav>

            <h1 className="text-2xl font-bold">メニュー新規作成</h1>
            <p className="mt-2 text-sm text-neutral-500">
                名前・価格・カテゴリの最低限を入れて下書きを作成します。作成後は編集画面へ移動し、アレルゲン28品目や公開設定を続けて登録できます。
            </p>

            <div className="mt-6">
                <NewMenuForm />
            </div>
        </main>
    );
}
