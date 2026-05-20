export default function AdminMenusLoading() {
    return (
        <div className="min-h-screen bg-[#f5f7f4]">
            <div className="mx-auto max-w-6xl px-4 py-6 pb-24 sm:pb-8">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <div className="h-4 w-24 animate-pulse rounded bg-green-100" />
                        <div className="mt-3 h-8 w-40 animate-pulse rounded bg-gray-200" />
                        <div className="mt-3 h-4 w-80 max-w-full animate-pulse rounded bg-gray-200" />
                    </div>
                    <div className="h-11 w-36 animate-pulse rounded-xl bg-gray-200" />
                </div>

                <div className="mt-6 rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
                    <div className="h-12 w-full animate-pulse rounded-lg bg-gray-100" />
                    <div className="mt-3 flex gap-2 overflow-hidden">
                        {Array.from({ length: 4 }).map((_, index) => (
                            <div
                                key={index}
                                className="h-9 w-24 shrink-0 animate-pulse rounded-full bg-gray-100"
                            />
                        ))}
                    </div>
                </div>

                <div className="mt-5 grid gap-3">
                    {Array.from({ length: 4 }).map((_, index) => (
                        <div
                            key={index}
                            className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm sm:p-4"
                        >
                            <div className="grid gap-3 sm:grid-cols-[88px_1fr_auto] sm:items-start">
                                <div className="h-20 w-20 animate-pulse rounded-lg bg-gray-100 sm:h-[88px] sm:w-[88px]" />
                                <div>
                                    <div className="h-6 w-2/3 animate-pulse rounded bg-gray-200" />
                                    <div className="mt-3 flex flex-wrap gap-2">
                                        <div className="h-7 w-20 animate-pulse rounded-full bg-gray-100" />
                                        <div className="h-7 w-32 animate-pulse rounded-full bg-gray-100" />
                                    </div>
                                    <div className="mt-4 h-4 w-5/6 animate-pulse rounded bg-gray-100" />
                                </div>
                                <div className="flex gap-2 sm:justify-end">
                                    <div className="h-10 w-20 animate-pulse rounded-lg bg-gray-200" />
                                    <div className="h-10 w-14 animate-pulse rounded-lg bg-red-100" />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
