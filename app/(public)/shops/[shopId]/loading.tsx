export default function PublicShopDetailLoading() {
    return (
        <main className="flex justify-center px-4 py-6 md:px-8">
            <div className="flex w-full max-w-[1024px] flex-col gap-6">
                <div className="flex gap-2">
                    <div className="h-5 w-16 animate-pulse rounded bg-gray-200" />
                    <div className="h-5 w-4 animate-pulse rounded bg-gray-200" />
                    <div className="h-5 w-32 animate-pulse rounded bg-gray-200" />
                </div>

                <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                    <div className="relative h-56 w-full animate-pulse bg-gray-200 md:h-64">
                        <div className="absolute bottom-0 left-0 right-0 p-6 md:p-8">
                            <div className="h-4 w-32 rounded bg-white/70" />
                            <div className="mt-3 h-10 w-2/3 rounded bg-white/80" />
                            <div className="mt-3 h-4 w-1/2 rounded bg-white/70" />
                        </div>
                    </div>
                </section>

                <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                    <div className="flex flex-col gap-6 lg:col-span-2">
                        <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
                            <div className="h-5 w-28 animate-pulse rounded bg-gray-200" />
                            <div className="mt-4 h-4 w-full animate-pulse rounded bg-gray-200" />
                            <div className="mt-3 h-4 w-5/6 animate-pulse rounded bg-gray-200" />
                            <div className="mt-5 flex flex-wrap gap-2">
                                <div className="h-7 w-28 animate-pulse rounded-full bg-gray-200" />
                                <div className="h-7 w-24 animate-pulse rounded-full bg-gray-200" />
                                <div className="h-7 w-36 animate-pulse rounded-full bg-gray-200" />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            {Array.from({ length: 4 }).map((_, index) => (
                                <div
                                    key={index}
                                    className="min-h-40 rounded-xl border border-gray-100 bg-white p-5 shadow-sm"
                                >
                                    <div className="h-5 w-2/3 animate-pulse rounded bg-gray-200" />
                                    <div className="mt-4 h-4 w-full animate-pulse rounded bg-gray-200" />
                                    <div className="mt-3 h-4 w-4/5 animate-pulse rounded bg-gray-200" />
                                    <div className="mt-5 h-8 w-24 animate-pulse rounded-lg bg-gray-200" />
                                </div>
                            ))}
                        </div>
                    </div>

                    <aside className="flex flex-col gap-6">
                        <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
                            <div className="h-5 w-24 animate-pulse rounded bg-gray-200" />
                            <div className="mt-5 space-y-4">
                                {Array.from({ length: 6 }).map((_, index) => (
                                    <div key={index}>
                                        <div className="h-4 w-20 animate-pulse rounded bg-gray-200" />
                                        <div className="mt-2 h-4 w-full animate-pulse rounded bg-gray-100" />
                                    </div>
                                ))}
                            </div>
                        </div>
                    </aside>
                </section>
            </div>
        </main>
    );
}
