import { PROTOTYPE_NOTICE } from "@/lib/public-prototype";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const geistSans = Geist({
    variable: "--font-geist-sans",
    subsets: ["latin"],
});

const geistMono = Geist_Mono({
    variable: "--font-geist-mono",
    subsets: ["latin"],
});

export const metadata: Metadata = {
    title: "ClearAllergy",
    description: "架空店舗のアレルゲン情報のUI・情報設計を検証するプロトタイプ",
    icons: {
        icon: "/images/clearallergy-mark-small.svg",
        shortcut: "/images/clearallergy-mark-small.svg",
        apple: "/images/clearallergy-mark-small.svg",
    },
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="ja">
            <head>
                {/* リガチャ文字をアイコンへ置き換えるフォントのため、読込中にアイコン名を表示しないようdisplay=blockを指定する。 */}
                {/* eslint-disable-next-line @next/next/no-page-custom-font, @next/next/google-font-display */}
                <link
                    rel="stylesheet"
                    href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0&icon_names=content_copy,delete,draft,edit,logout,menu_book,notification_important,open_in_new,print,priority_high,restaurant,search,search_off,storefront,task_alt,visibility,visibility_off,warning&display=block"
                />
            </head>
            <body
                className={`${geistSans.variable} ${geistMono.variable} antialiased`}
            >
                <aside aria-label="プロトタイプについて" className="mx-auto max-w-7xl px-4 pt-4">
                    <p className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">{PROTOTYPE_NOTICE}</p>
                </aside>
                {children}
                <Analytics />
            </body>
        </html>
    );
}