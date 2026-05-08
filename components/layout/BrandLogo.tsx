import Image from "next/image";

type BrandLogoProps = {
    variant?: "header" | "publicHeader" | "compact" | "hero";
    priority?: boolean;
};

const variantClassMap: Record<
    NonNullable<BrandLogoProps["variant"]>,
    {
        wrapper: string;
        icon: number;
        image: string;
        text: string;
    }
> = {
    header: {
        wrapper: "gap-2.5",
        icon: 32,
        image: "h-8 w-8",
        text: "text-[28px] font-black tracking-[-0.04em]",
    },
    publicHeader: {
        wrapper: "gap-2 sm:gap-2.5",
        icon: 32,
        image: "h-7 w-7 sm:h-8 sm:w-8",
        text: "text-xl font-black tracking-[-0.04em] sm:text-[28px]",
    },
    compact: {
        wrapper: "gap-2",
        icon: 28,
        image: "h-7 w-7",
        text: "text-[24px] font-black tracking-[-0.04em]",
    },
    hero: {
        wrapper: "gap-3",
        icon: 42,
        image: "h-[42px] w-[42px]",
        text: "text-[32px] font-black tracking-[-0.04em]",
    },
};

export default function BrandLogo({
    variant = "header",
    priority = false,
}: BrandLogoProps) {
    const config = variantClassMap[variant];

    return (
        <div
            className={`inline-flex min-w-0 max-w-full items-center ${config.wrapper}`}
        >
            <Image
                src="/images/clearallergy-mark.svg"
                alt=""
                width={config.icon}
                height={config.icon}
                priority={priority}
                className={`shrink-0 object-contain ${config.image}`}
            />
            <span
                className={`min-w-0 truncate leading-none text-current ${config.text}`}
            >
                ClearAllergy
            </span>
        </div>
    );
}
