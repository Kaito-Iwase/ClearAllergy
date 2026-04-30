export default function PublicMenuDetailLoading() {
    return (
        <main className="flex justify-center px-4 py-6 md:px-8">
            <div className="flex w-full max-w-[1024px] flex-col gap-8">
                <div className="flex gap-2">
                    <div className="h-5 w-16 animate-pulse rounded bg-gray-200" />
                    <div className="h-5 w-4 animate-pulse rounded bg-gray-200" />
                    <div className="h-5 w-28 animate-pulse rounded bg-gray-200" />
                    <div className="h-5 w-4 animate-pulse rounded bg-gray-200" />
                    <div className="h-5 w-32 animate-pulse rounded bg-gray-200" />
                </div>

                <div className="h-28 rounded-xl bg-gray-100 p-6 shadow-sm">
                    <div className="h-7 w-2/3 animate-pulse rounded bg-gray-200" />
                    <div className="mt-4 h-4 w-full animate-pulse rounded bg-gray-200" />
                    <div className="mt-3 h-4 w-4/5 animate-pulse rounded bg-gray-200" />
                </div>

                <div className="grid grid-cols-1 gap-8 lg:grid-cols-3 lg:items-start">
                    <div className="space-y-8 lg:col-span-2">
                        <div className="grid grid-cols-1 items-start gap-x-8 gap-y-6 md:grid-cols-2 lg:gap-x-12">
                            <div className="aspect-square animate-pulse rounded-2xl bg-gray-200 shadow-sm" />

                            <div className="flex flex-col gap-6">
                                <div>
                                    <div className="h-4 w-36 animate-pulse rounded bg-gray-200" />
                                    <div className="mt-4 h-8 w-5/6 animate-pulse rounded bg-gray-200" />
                                    <div className="mt-4 h-5 w-full animate-pulse rounded bg-gray-200" />
                                    <div className="mt-3 h-5 w-3/4 animate-pulse rounded bg-gray-200" />
                                    <div className="mt-6 h-8 w-32 animate-pulse rounded bg-gray-200" />
                                </div>
                                <div className="h-12 w-full animate-pulse rounded-lg bg-gray-200" />
                            </div>
                        </div>

                        <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
                            <div className="h-6 w-28 animate-pulse rounded bg-gray-200" />
                            <div className="mt-5 h-4 w-full animate-pulse rounded bg-gray-200" />
                            <div className="mt-3 h-4 w-5/6 animate-pulse rounded bg-gray-200" />
                        </div>

                        <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
                            <div className="h-6 w-40 animate-pulse rounded bg-gray-200" />
                            <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                                {Array.from({ length: 8 }).map((_, index) => (
                                    <div
                                        key={index}
                                        className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2"
                                    >
                                        <div className="h-4 w-20 animate-pulse rounded bg-gray-200" />
                                        <div className="h-6 w-16 animate-pulse rounded-full bg-gray-200" />
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col gap-6">
                        <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
                            <div className="h-5 w-24 animate-pulse rounded bg-gray-200" />
                            <div className="mt-5 space-y-3">
                                <div className="h-4 w-full animate-pulse rounded bg-gray-200" />
                                <div className="h-4 w-5/6 animate-pulse rounded bg-gray-200" />
                                <div className="h-4 w-4/5 animate-pulse rounded bg-gray-200" />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </main>
    );
}
