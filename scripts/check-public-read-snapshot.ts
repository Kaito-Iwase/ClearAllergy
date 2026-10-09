import assert from "node:assert/strict";
import { createServer, connect, type Socket } from "node:net";
import { PrismaClient, type Prisma } from "@prisma/client";
import { assertCiDatabaseTarget } from "./ci-environment";
import { publishReviewedFixture } from "./food-review-fixture";
import { readPublicSnapshot } from "../features/public/shops/server/public-read-snapshot";

// A loopback-only wire gate pauses the real ORM's child SELECT, commits a real
// correction on another connection, then releases it. No mocked query result.
async function main() {
    assertCiDatabaseTarget();
    const target = new URL(process.env.DATABASE_URL!);
    const db = new PrismaClient();
    let shopId: string | undefined;
    try {
        const master = await db.allergen.findMany();
        const egg = master.find(a => a.slug === "egg");
        assert.ok(egg);
        const shop = await db.shop.create({ data: { name: "【架空】公開読取の競合検査", isActive: true } });
        shopId = shop.id;
        for (const consistent of [false, true]) {
            const menu = await db.$transaction(async tx => {
                const created = await tx.menuItem.create({ data: { shopId: shop.id, name: "【架空】旧卵入り食品", allergenLinks: {
                    create: master.map(a => ({ allergenId: a.id, status: a.slug === "egg" ? "CONTAINS" : "FREE" })),
                } } });
                return publishReviewedFixture(tx, created.id);
            });
            let gated = false;
            let failure: unknown;
            const sockets = new Set<Socket>();
            const server = createServer(client => {
                const upstream = connect(Number(target.port || 5432), target.hostname);
                for (const socket of [client, upstream]) {
                    sockets.add(socket);
                    socket.on("close", () => sockets.delete(socket));
                    socket.on("error", error => { failure ??= error; client.destroy(); upstream.destroy(); });
                }
                upstream.on("data", chunk => client.write(chunk));
                upstream.on("end", () => client.end());
                client.on("end", () => upstream.end());
                let tail = "";
                client.on("data", chunk => {
                    const text = tail + chunk.toString("utf8");
                    tail = text.slice(-2048);
                    if (!gated && text.includes('FROM "public"."MenuItemAllergen"')) {
                        gated = true; client.pause();
                        void db.$transaction(async tx => {
                            await tx.menuItem.update({ where: { id: menu.id }, data: { name: "【架空】未確認の新食品", ingredients: "架空の仕様変更" } });
                            await tx.menuItemAllergen.update({ where: { menuItemId_allergenId: { menuItemId: menu.id, allergenId: egg.id } }, data: { status: "FREE" } });
                        }).then(() => { upstream.write(chunk); client.resume(); }, error => { failure = error; client.destroy(); upstream.destroy(); });
                    } else upstream.write(chunk);
                });
            });
            await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
            const address = server.address(); assert.ok(address && typeof address !== "string");
            const proxyUrl = new URL(target); proxyUrl.hostname = "127.0.0.1"; proxyUrl.port = String(address.port);
            const reader = new PrismaClient({ datasourceUrl: proxyUrl.href });
            try {
                const read = (tx: Prisma.TransactionClient) => tx.menuItem.findFirstOrThrow({
                    where: { id: menu.id, isPublished: true, shop: { isActive: true } },
                    select: { name: true, foodVersion: true, reviewedFoodVersion: true,
                        allergenLinks: { select: { status: true, allergen: { select: { slug: true } } } } },
                });
                const observed = consistent ? await readPublicSnapshot(read, reader) : await read(reader);
                if (failure) throw failure;
                assert.equal(gated, true, "Must intercept the actual child SELECT after the parent read");
                assert.equal(observed.name, "【架空】旧卵入り食品");
                assert.equal(observed.foodVersion, observed.reviewedFoodVersion);
                assert.equal(observed.allergenLinks.find(a => a.allergen.slug === "egg")?.status, consistent ? "CONTAINS" : "FREE");
                assert.equal((await db.menuItem.findUniqueOrThrow({ where: { id: menu.id } })).isPublished, false);
                assert.equal(await reader.menuItem.findFirst({ where: { id: menu.id, isPublished: true } }), null);
                console.log(consistent
                    ? "PASS: production snapshot helper keeps old food/CONTAINS coherent through a committed correction; next request rejects stopped food"
                    : "PASS: counterexample reproduced on actual Prisma wire: old reviewed food combined with new unreviewed FREE without a snapshot");
            } finally {
                await reader.$disconnect();
                for (const socket of sockets) socket.destroy();
                await new Promise<void>(resolve => server.close(() => resolve()));
            }
        }
    } finally {
        if (shopId) await db.shop.delete({ where: { id: shopId } });
        await db.$disconnect();
    }
}
main().catch(() => { console.error("Public read snapshot regression failed; use the disposable CI target. Raw DB errors are not logged."); process.exitCode = 1; });
