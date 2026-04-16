import { prisma } from "@/lib/db";
import HomePageView from "@/components/public/HomePageView";
import { readPublicDataOrFallback } from "@/lib/public-db";

export const dynamic = "force-dynamic";

export default async function HomePage() {
    const { data: featuredShop, isDatabaseAvailable } =
        await readPublicDataOrFallback(
            () =>
                prisma.shop.findFirst({
                    where: {
                        menus: {
                            some: {
                                isPublished: true,
                            },
                        },
                    },
                    orderBy: {
                        updatedAt: "desc",
                    },
                    select: {
                        id: true,
                        name: true,
                        description: true,
                        menus: {
                            where: { isPublished: true },
                            orderBy: { updatedAt: "desc" },
                            take: 3,
                            select: {
                                id: true,
                                name: true,
                                priceYen: true,
                                allergenLinks: {
                                    where: {
                                        status: {
                                            in: ["CONTAINS", "MAY_CONTAIN"],
                                        },
                                    },
                                    select: {
                                        status: true,
                                    },
                                },
                            },
                        },
                        _count: {
                            select: {
                                menus: {
                                    where: {
                                        isPublished: true,
                                    },
                                },
                            },
                        },
                    },
                }),
            null,
        );

    return (
        <HomePageView
            featuredShop={featuredShop}
            isDatabaseAvailable={isDatabaseAvailable}
        />
    );
}
