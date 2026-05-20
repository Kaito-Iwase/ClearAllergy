export default function AdminMenuEditLoading() {
    return (
        <div className="min-h-screen bg-gray-50">
            <div className="mx-auto max-w-6xl px-4 py-6">
                <div className="mb-4 flex gap-2">
                    <div className="h-5 w-24 animate-pulse rounded bg-gray-200" />
                    <div className="h-5 w-4 animate-pulse rounded bg-gray-200" />
                    <div className="h-5 w-32 animate-pulse rounded bg-gray-200" />
                </div>
                <div className="h-8 w-40 animate-pulse rounded bg-gray-200" />
                <div className="mt-3 h-4 w-96 max-w-full animate-pulse rounded bg-gray-200" />

                <div className="mt-6 space-y-6">
                    <div className="rounded-2xl bg-white p-5 shadow-sm">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="h-5 w-24 animate-pulse rounded bg-gray-200" />
                            <div className="flex gap-2">
                                <div className="h-10 w-36 animate-pulse rounded-xl bg-gray-200" />
                                <div className="h-10 w-24 animate-pulse rounded-xl bg-gray-200" />
                                <div className="h-10 w-20 animate-pulse rounded-xl bg-green-100" />
                            </div>
                        </div>
                        <div className="mt-5 grid gap-4 md:grid-cols-2">
                            {Array.from({ length: 6 }).map((_, index) => (
                                <div key={index}>
                                    <div className="h-4 w-20 animate-pulse rounded bg-gray-200" />
                                    <div className="mt-2 h-12 w-full animate-pulse rounded-xl bg-gray-100" />
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
                            <div>
                                <div className="h-5 w-32 animate-pulse rounded bg-gray-200" />
                                <div className="mt-4 aspect-square max-w-sm animate-pulse rounded-xl bg-gray-100" />
                            </div>
                            <div className="space-y-3">
                                <div className="h-5 w-28 animate-pulse rounded bg-gray-200" />
                                {Array.from({ length: 3 }).map((_, index) => (
                                    <div
                                        key={index}
                                        className="h-16 animate-pulse rounded-xl border border-gray-100 bg-gray-50"
                                    />
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="rounded-2xl bg-white p-5 shadow-sm">
                        <div className="h-5 w-40 animate-pulse rounded bg-gray-200" />
                        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            {Array.from({ length: 9 }).map((_, index) => (
                                <div
                                    key={index}
                                    className="h-20 animate-pulse rounded-xl border border-gray-100 bg-gray-50"
                                />
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
