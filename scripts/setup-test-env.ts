import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createClerkClient } from "@clerk/backend";
import { PrismaClient } from "@prisma/client";
import { assertTestDatabaseTarget } from "./test-environment";
import { ALLERGEN_MASTER } from "../lib/constants/allergen-master";
import { DEMO_USER_EMAIL } from "../lib/auth/demo-shop";
import { DEMO_MENUS, validateDemoMenuFixtures } from "../prisma/demo-menus";

type Account = { email: string; password: string; clerkUserId?: string; shopId?: string };
type State = { instance: string; accounts: Account[] };
const statePath = ".clerk/clearallergy-test-accounts.json";

async function main() {
    assertTestDatabaseTarget();
    if (!process.env.CLERK_SECRET_KEY?.startsWith("sk_test_") || !process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith("pk_test_")) {
        throw new Error("Clerkの開発用キーだけを使用してください。");
    }
    validateDemoMenuFixtures();
    execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], { stdio: "inherit" });
    mkdirSync(".clerk", { recursive: true, mode: 0o700 });
    const instance = randomUUID();
    const state: State = existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : {
        instance,
        accounts: ["a", "b"].map((role) => ({
            email: `clearallergy-${role}+clerk_test_${instance}@example.com`,
            password: randomBytes(24).toString("base64url") + "aA1!",
        })),
    };
    if (!state.instance || state.accounts.length !== 2 || state.accounts.some((a) => !a.email.includes(`+clerk_test_${state.instance}@example.com`))) {
        throw new Error("保存されたテストアカウント情報の形式を確認してください。");
    }
    const save = () => writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n", { mode: 0o600 });
    save(); // 途中で失敗しても、今回のアカウントだけを特定して再実行できるようにする。
    const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
    const prisma = new PrismaClient();
    try {
        for (const [index, account] of state.accounts.entries()) {
            const existing = account.clerkUserId
                ? await clerk.users.getUser(account.clerkUserId)
                : (await clerk.users.getUserList({ emailAddress: [account.email], limit: 1 })).data[0];
            if (existing && existing.privateMetadata.clearallergyTestInstance !== state.instance) {
                throw new Error("このテスト環境が作成したものではないアカウントは変更できません。");
            }
            const user = existing ?? await clerk.users.createUser({
                emailAddress: [account.email], password: account.password,
                privateMetadata: { clearallergyTestInstance: state.instance },
            });
            account.clerkUserId = user.id;
            save();
            const appUser = await prisma.user.upsert({
                where: { clerkUserId: user.id }, update: {},
                create: { clerkUserId: user.id, email: account.email },
            });
            const shop = await prisma.shop.upsert({
                where: { ownerClerkUserId: user.id }, update: {},
                create: { userId: appUser.id, ownerClerkUserId: user.id, isActive: true,
                    name: `【架空・テスト専用】店舗${index === 0 ? "A" : "B"}`,
                    description: "UI操作と店舗間の権限を確認する架空店舗です。実在しません。" },
            });
            account.shopId = shop.id;
            save();
        }
        for (const allergen of ALLERGEN_MASTER) await prisma.allergen.upsert({ where: { slug: allergen.slug }, update: {}, create: allergen });
        const demoUser = await prisma.user.upsert({ where: { email: DEMO_USER_EMAIL }, update: {}, create: { email: DEMO_USER_EMAIL } });
        const demoShop = await prisma.shop.upsert({ where: { userId: demoUser.id }, update: {}, create: {
            userId: demoUser.id, isActive: true, name: "【架空店舗】ClearAllergyデモカフェ",
            description: "架空の店舗・メニューを使ったUI検証用プロトタイプです。実際の飲食判断には使用しないでください。",
            prefecture: "東京都", city: "渋谷区", address: "架空住所（実在しません）", category: "カフェ",
        } });
        const master = await prisma.allergen.findMany({ select: { id: true, slug: true } });
        for (const shopId of [demoShop.id, ...state.accounts.map((a) => a.shopId!)]) {
            for (const menu of DEMO_MENUS) {
                if (await prisma.menuItem.findFirst({ where: { shopId, name: menu.name }, select: { id: true } })) continue;
                const { allergenStatusBySlug, ...fields } = menu;
                await prisma.menuItem.create({ data: { ...fields, shopId, isPublished: true,
                    allergenLinks: { create: master.map((a) => ({ allergenId: a.id, status: allergenStatusBySlug[a.slug] })) },
                } });
            }
        }
        console.log("テスト専用DB・架空店舗3件・管理者2アカウントを準備しました。");
        console.log(`ログイン情報は ${statePath} に保存しました（Git対象外、標準出力へは表示しません）。`);
    } finally { await prisma.$disconnect(); }
}
main().catch((error: unknown) => {
    // 外部SDKの詳細オブジェクトや秘密値をそのまま出力しない。
    console.error(error instanceof Error ? error.message : "テスト環境の準備に失敗しました。");
    process.exitCode = 1;
});
