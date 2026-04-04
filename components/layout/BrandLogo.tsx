import Image from "next/image";

type BrandLogoProps = {
    variant?: "header" | "compact" | "hero";
    priority?: boolean;
};

const variantClassMap: Record<
    NonNullable<BrandLogoProps["variant"]>,
    {
        wrapper: string;
        icon: number;
        text: string;
    }
> = {
    header: {
        wrapper: "gap-2.5",
        icon: 32,
        text: "text-[28px] font-black tracking-[-0.04em]",
    },
    compact: {
        wrapper: "gap-2",
        icon: 28,
        text: "text-[24px] font-black tracking-[-0.04em]",
    },
    hero: {
        wrapper: "gap-3",
        icon: 42,
        text: "text-[32px] font-black tracking-[-0.04em]",
    },
};

export default function BrandLogo({
    variant = "header",
    priority = false,
}: BrandLogoProps) {
    const config = variantClassMap[variant];

    return (
        <div className={`inline-flex items-center ${config.wrapper}`}>
            <Image
                src="/images/clearallergy-mark.svg"
                alt=""
                width={config.icon}
                height={config.icon}
                priority={priority}
                className="shrink-0 object-contain"
            />
            <span className={`leading-none text-current ${config.text}`}>
                ClearAllergy
            </span>
        </div>
    );
}
