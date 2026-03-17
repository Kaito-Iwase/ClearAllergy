import Link from "next/link";

export default function NotFound() {
    return (
        <main className="flex min-h-screen items-center justify-center bg-[#f6f8f6] px-4 py-12 text-[#111811]">
            <div className="w-full max-w-xl rounded-3xl border border-gray-200 bg-white p-8 text-center shadow-sm">
                <p className="text-sm font-semibold text-green-700">404</p>
                <h1 className="mt-2 text-3xl font-extrabold">
                    ページが見つかりません
                </h1>
                <p className="mt-4 text-sm leading-7 text-gray-600">
                    URL が変わったか、公開されていない店舗・メニューの可能性があります。トップまたは店舗一覧から見直してください。
                </p>

                <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
                    <Link
                        href="/"
                        className="rounded-xl bg-[#13ec13] px-5 py-3 text-sm font-bold text-black"
                    >
                        トップへ戻る
                    </Link>
                    <Link
                        href="/shops"
                        className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-bold text-gray-800"
                    >
                        店舗一覧を見る
                    </Link>
                </div>
            </div>
        </main>
    );
}
