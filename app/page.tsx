import { prisma } from "@/lib/db";
import HomePageView from "@/components/public/HomePageView";

export default async function HomePage() {
    const featuredShop = await prisma.shop.findFirst({
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
    });

    return <HomePageView featuredShop={featuredShop} />;
}
