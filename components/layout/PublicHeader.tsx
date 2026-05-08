import Link from "next/link";
import { Suspense } from "react";
import BrandLogo from "@/components/layout/BrandLogo";
import PublicSearchBox from "@/components/public/PublicSearchBox";

export default function PublicHeader() {
    return (
        <header className="sticky top-0 z-50 w-full border-b border-gray-200 bg-white shadow-sm">
            <div className="mx-auto flex h-14 w-full max-w-[1200px] items-center justify-between gap-3 px-4 sm:px-6 md:px-10">
                <div className="flex min-w-0 items-center gap-8">
                    <Link href="/" className="flex min-w-0 items-center">
                        <BrandLogo variant="publicHeader" priority />
                    </Link>

                    <nav className="hidden items-center gap-9 md:flex">
                        <Link
                            className="text-sm font-medium text-gray-700 hover:text-[#13ec13]"
                            href="/shops"
                        >
                            店舗一覧
                        </Link>
                        <Link
                            className="text-sm font-medium text-gray-700 hover:text-[#13ec13]"
                            href="/terms"
                        >
                            利用規約
                        </Link>
                    </nav>
                </div>

                <div className="hidden w-full max-w-xs md:block">
                    <Suspense
                        fallback={
                            <div className="h-10 rounded-lg bg-gray-100" />
                        }
                    >
                        <PublicSearchBox />
                    </Suspense>
                </div>
            </div>
        </header>
    );
}
