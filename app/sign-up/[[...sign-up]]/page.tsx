import { SignUp } from "@clerk/nextjs";
import Link from "next/link";
import BrandLogo from "@/components/layout/BrandLogo";

export default function SignUpPage() {
    return (
        <div className="flex min-h-screen flex-col bg-background-light text-text-main">
            <header className="flex items-center justify-between border-b border-[#e5e7eb] bg-surface-light px-6 py-4 lg:px-10">
                <Link href="/" className="inline-flex items-center">
                    <BrandLogo priority />
                </Link>
                <Link
                    href="/admin/login"
                    className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-900 transition hover:bg-gray-50"
                >
                    ログイン
                </Link>
            </header>

            <main className="flex flex-1 items-center justify-center p-4 py-12">
                <SignUp
                    routing="path"
                    path="/sign-up"
                    signInUrl="/admin/login"
                    fallbackRedirectUrl="/admin/register"
                    forceRedirectUrl="/admin/register"
                />
            </main>
        </div>
    );
}
