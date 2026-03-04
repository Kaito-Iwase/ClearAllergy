// app/(public)/layout.tsx
import PublicHeader from "@/components/layout/PublicHeader";

export default function PublicLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="min-h-screen bg-background-light dark:bg-background-dark text-text-main dark:text-slate-100 font-display">
            <PublicHeader />
            {children}
        </div>
    );
}
