import Link from "next/link";

export default function PublicDataUnavailable({
    title,
    description,
    backHref,
    backLabel,
}: {
    title: string;
    description: string;
    backHref: string;
    backLabel: string;
}) {
    return (
        <main className="mx-auto flex min-h-[calc(100vh-96px)] max-w-3xl items-center px-4 py-10">
            <section className="w-full rounded-3xl border border-amber-200 bg-white p-8 shadow-sm">
                <p className="text-sm font-semibold text-amber-700">
                    Temporary issue
                </p>
                <h1 className="mt-2 text-2xl font-bold tracking-tight text-neutral-900">
                    {title}
                </h1>
                <p className="mt-4 text-sm leading-7 text-neutral-600">
                    {description}
                </p>

                <div className="mt-6">
                    <Link
                        href={backHref}
                        className="inline-flex items-center rounded-xl bg-[#13ec13] px-4 py-2 text-sm font-bold text-black transition hover:bg-[#0db80d]"
                    >
                        {backLabel}
                    </Link>
                </div>
            </section>
        </main>
    );
}
