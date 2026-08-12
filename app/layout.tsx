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
    description: "Allergy-friendly menu viewer",
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
                {children}
                <Analytics />
            </body>
        </html>
    );
}