export default function PublicShopListLoading() {
    return (
        <main className="mx-auto max-w-5xl px-4 py-8">
            <section className="mb-6 rounded-2xl border border-green-100 bg-white p-6 shadow-sm">
                <div className="h-4 w-28 animate-pulse rounded bg-green-100" />
                <div className="mt-4 h-8 w-3/4 animate-pulse rounded bg-neutral-200" />
                <div className="mt-3 h-4 w-full animate-pulse rounded bg-neutral-100" />
                <div className="mt-2 h-4 w-2/3 animate-pulse rounded bg-neutral-100" />
            </section>

            <div className="mb-6 flex items-end justify-between gap-4">
                <div>
                    <div className="h-3 w-24 animate-pulse rounded bg-neutral-200" />
                    <div className="mt-2 h-7 w-32 animate-pulse rounded bg-neutral-200" />
                </div>
                <div className="h-4 w-14 animate-pulse rounded bg-neutral-200" />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {Array.from({ length: 4 }).map((_, index) => (
                    <div
                        key={index}
                        className="min-h-[320px] rounded-[28px] border border-neutral-200 bg-white p-5 shadow-sm sm:p-6"
                    >
                        <div className="flex items-start justify-between gap-3">
                            <div className="h-7 w-32 animate-pulse rounded-full bg-neutral-100" />
                            <div className="h-7 w-20 animate-pulse rounded-full bg-neutral-100" />
                        </div>
                        <div className="mt-24">
                            <div className="h-8 w-3/4 animate-pulse rounded bg-neutral-200" />
                            <div className="mt-4 h-4 w-full animate-pulse rounded bg-neutral-100" />
                            <div className="mt-2 h-4 w-5/6 animate-pulse rounded bg-neutral-100" />
                            <div className="mt-5 flex flex-wrap gap-2">
                                <div className="h-7 w-28 animate-pulse rounded-full bg-neutral-100" />
                                <div className="h-7 w-36 animate-pulse rounded-full bg-neutral-100" />
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </main>
    );
}
