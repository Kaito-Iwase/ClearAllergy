import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { internalError, readJson, requireShopId } from "@/app/api/admin/_utils";
import {
    toRequiredTrimmedString,
    toTrimmedNullableString,
} from "@/lib/admin-validators";

type ShopUpdateBody = {
    name?: unknown;
    description?: unknown;
    address?: unknown;
    hours?: unknown;
    coverImageUrl?: unknown;
};

export async function GET() {
    try {
        const auth = await requireShopId();
        if (!auth.ok) {
            return auth.res;
        }

        const shop = await prisma.shop.findUnique({
            where: { id: auth.shopId },
            select: {
                id: true,
                name: true,
                description: true,
                address: true,
                hours: true,
                coverImageUrl: true,
                updatedAt: true,
            },
        });

        if (!shop) {
            return NextResponse.json(
                { error: "shop not found" },
                { status: 404 },
            );
        }

        return NextResponse.json({ shop });
    } catch (e) {
        return internalError(e);
    }
}

export async function PUT(req: Request) {
    try {
        const auth = await requireShopId();
        if (!auth.ok) {
            return auth.res;
        }

        const body = await readJson<ShopUpdateBody>(req);
        if (!body) {
            return NextResponse.json(
                { error: "bad request: invalid json" },
                { status: 400 },
            );
        }

        const name = toRequiredTrimmedString(body.name);
        if (!name) {
            return NextResponse.json(
                { error: "bad request: name is required" },
                { status: 400 },
            );
        }

        const description = toTrimmedNullableString(body.description);
        const address = toTrimmedNullableString(body.address);
        const hours = toTrimmedNullableString(body.hours);
        const coverImageUrl = toTrimmedNullableString(body.coverImageUrl);

        const shop = await prisma.shop.update({
            where: { id: auth.shopId },
            data: {
                name,
                description,
                address,
                hours,
                coverImageUrl,
            },
            select: {
                id: true,
                name: true,
                description: true,
                address: true,
                hours: true,
                coverImageUrl: true,
                updatedAt: true,
            },
        });

        return NextResponse.json({ shop });
    } catch (e) {
        return internalError(e);
    }
}
