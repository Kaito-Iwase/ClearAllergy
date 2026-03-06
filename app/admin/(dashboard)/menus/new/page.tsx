// app/(admin)/admin/menus/new/page.tsx

import NewMenuForm from "./NewMenuForm";

export default function AdminMenuNewPage() {
    return (
        <main className="mx-auto w-full max-w-2xl p-6">
            <h1 className="text-2xl font-bold">メニュー新規作成</h1>
            <p className="mt-2 text-sm text-neutral-500">
                まずは名前だけで作成できます。作成後にアレルゲン（28品目）を編集します。
            </p>

            <div className="mt-6">
                <NewMenuForm />
            </div>
        </main>
    );
}
