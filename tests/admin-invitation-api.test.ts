import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import Module, { createRequire } from "node:module";
import type { AdminInvite } from "@prisma/client";
import { prisma } from "../lib/db";

// Only Clerk I/O is replaced. The actual authentication, route and acceptance
// code run against a transaction-capable in-memory store in this test process.
let clerkUserId: string | null = "user_platformAdmin";
let role: string | null = "admin";
let remoteCreate: () => Promise<{ id: string; url: string }>;
let remoteRevoke: (id: string) => Promise<void>;
let remoteLookup: () => Promise<unknown>;
const loader = Module as unknown as { _load: (id: string, ...args: unknown[]) => unknown };
const originalLoad = loader._load;
const requireForTest = createRequire(import.meta.url);
let revokeRoute: typeof import("../features/admin/invitations/server/revokeInvitationRoute");
let resendRoute: typeof import("../features/admin/invitations/server/resendInvitationRoute");
let acceptRoute: typeof import("../features/admin/invitations/server/acceptInvitationRoute");
let createRoute: typeof import("../features/admin/invitations/server/adminInvitationsRoute");
try {
    loader._load = function (id, ...args) {
        if (id === "@clerk/nextjs/server") {
            return {
                auth: async () => ({ userId: clerkUserId }),
                currentUser: async () => ({
                    publicMetadata: { role }, externalId: null,
                    primaryEmailAddressId: "email-1",
                    emailAddresses: [{ id: "email-1", emailAddress: "invitee@example.test" }],
                }),
            };
        }
        if (id === "@/lib/auth/clerkAdminServer") {
            return {
                createClerkApplicationInvitation: () => remoteCreate(),
                revokeClerkApplicationInvitation: (inviteId: string) => remoteRevoke(inviteId),
                findClerkUserByEmail: () => remoteLookup(),
            };
        }
        return originalLoad.call(this, id, ...args);
    };
    revokeRoute = requireForTest("../features/admin/invitations/server/revokeInvitationRoute.ts");
    resendRoute = requireForTest("../features/admin/invitations/server/resendInvitationRoute.ts");
    acceptRoute = requireForTest("../features/admin/invitations/server/acceptInvitationRoute.ts");
    createRoute = requireForTest("../features/admin/invitations/server/adminInvitationsRoute.ts");
} finally {
    loader._load = originalLoad;
}

type Query = { where?: Record<string, unknown>; data?: Record<string, unknown> };
function replace(t: TestContext, target: object, key: string, value: unknown) {
    const delegate = target as Record<string, unknown>;
    const previous = delegate[key];
    delegate[key] = value;
    t.after(() => { delegate[key] = previous; });
}
function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>((done) => { resolve = done; });
    return { promise, resolve };
}
function request(action: "revoke" | "resend" | "accept" | "create", body?: unknown) {
    const path = action === "accept" ? "/api/invitations/accept"
        : action === "create" ? "/api/admin/invitations"
            : `/api/admin/invitations/invite-1/${action}`;
    return new Request(`http://localhost${path}`, {
        method: "POST", headers: { Origin: "http://localhost", "Content-Type": "application/json" },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
}
function setup(t: TestContext) {
    clerkUserId = "user_platformAdmin";
    role = "admin";
    const portfolioMode = process.env.PORTFOLIO_MODE;
    process.env.PORTFOLIO_MODE = "false";
    t.after(() => {
        if (portfolioMode === undefined) delete process.env.PORTFOLIO_MODE;
        else process.env.PORTFOLIO_MODE = portfolioMode;
    });
    const now = new Date();
    const original: AdminInvite = {
        id: "invite-1", email: "invitee@example.test", shopId: "shop-1", status: "pending",
        clerkInvitationId: "clerk-old", expiresAt: new Date(now.getTime() + 86400_000),
        invitedByClerkUserId: "user_platformAdmin", acceptedByClerkUserId: null,
        acceptedAt: null, revokedAt: null, createdAt: now, updatedAt: now,
    };
    const state = {
        invites: [original],
        shop: { id: "shop-1", name: "招待店舗", userId: null as string | null, ownerClerkUserId: null as string | null, isActive: false },
        appUser: null as { id: string; email: string; clerkUserId: string; shop: null } | null,
        audits: [] as Record<string, unknown>[],
        revoked: [] as string[],
        created: 0,
    };
    function matches(invite: AdminInvite, where: Query["where"] = {}) {
        return Object.entries(where).every(([key, value]) => {
            if (key === "expiresAt") return false; // No fixture expires during a test.
            return invite[key as keyof AdminInvite] === value;
        });
    }
    const withShop = (invite: AdminInvite) => structuredClone({ ...invite, shop: state.shop });
    const inviteDelegate = {
        findUnique: async ({ where }: Query) => {
            const invite = state.invites.find((entry) => matches(entry, where));
            return invite ? withShop(invite) : null;
        },
        findUniqueOrThrow: async ({ where }: Query) => {
            const invite = state.invites.find((entry) => matches(entry, where));
            assert.ok(invite);
            return withShop(invite);
        },
        findFirst: async ({ where }: Query) => state.invites.find((entry) => matches(entry, where)) ?? null,
        updateMany: async ({ where, data }: Query) => {
            const matching = state.invites.filter((entry) => matches(entry, where));
            for (const invite of matching) Object.assign(invite, data);
            return { count: matching.length };
        },
        update: async ({ where, data }: Query) => {
            const invite = state.invites.find((entry) => matches(entry, where));
            assert.ok(invite);
            Object.assign(invite, data);
            return withShop(invite);
        },
        create: async ({ data }: Query) => {
            const invite = {
                ...original, acceptedAt: null, acceptedByClerkUserId: null, revokedAt: null,
                ...data, id: `invite-${state.invites.length + 1}`,
            } as AdminInvite;
            state.invites.push(invite);
            return withShop(invite);
        },
    };
    for (const [key, value] of Object.entries(inviteDelegate)) replace(t, prisma.adminInvite, key, value);
    replace(t, prisma.auditLog, "create", async ({ data }: Query) => { state.audits.push(data!); return {}; });
    const tx = {
        adminInvite: inviteDelegate,
        $queryRaw: async () => state.invites.filter((invite) => invite.status === "pending" && invite.email === "invitee@example.test").slice(0, 1),
        shop: {
            create: async () => structuredClone(state.shop),
            findUnique: async () => structuredClone(state.shop),
            findUniqueOrThrow: async () => structuredClone(state.shop),
            update: async ({ data }: Query) => { Object.assign(state.shop, data); return structuredClone(state.shop); },
        },
        user: {
            findUnique: async () => state.appUser,
            create: async ({ data }: Query) => { state.appUser = { ...data, id: "app-invitee", shop: null } as NonNullable<typeof state.appUser>; return state.appUser; },
        },
    };
    let transactions = Promise.resolve();
    replace(t, prisma, "$transaction", async (work: (client: typeof tx) => Promise<unknown>) => {
        // Serialize commits and restore failed writes to represent DB atomicity.
        const previous = transactions;
        const done = deferred();
        transactions = done.promise;
        await previous;
        const snapshot = structuredClone({ invites: state.invites, shop: state.shop, appUser: state.appUser });
        try { return await work(tx); }
        catch (error) { Object.assign(state, snapshot); throw error; }
        finally { done.resolve(); }
    });
    remoteRevoke = async (id) => { state.revoked.push(id); };
    remoteCreate = async () => { state.created += 1; return { id: `clerk-new-${state.created}`, url: "https://example.test/invite" }; };
    remoteLookup = async () => null;
    t.mock.method(console, "error", () => {});
    return { state, inviteDelegate, tx };
}

test("未認証・運営権限のない招待作成/再送/取消はDB/Clerk操作前に拒否する", async (t) => {
    const { state } = setup(t);
    replace(t, prisma.adminInvite, "findUnique", async () => assert.fail("DB before authorization"));
    for (const [userId, userRole, status] of [[null, null, 401], ["store-owner", null, 403]] as const) {
        clerkUserId = userId;
        role = userRole;
        assert.equal((await revokeRoute.POST(request("revoke"))).status, status);
        assert.equal((await resendRoute.POST(request("resend"))).status, status);
        assert.equal((await createRoute.POST(request("create", {}))).status, status);
    }
    assert.equal(state.created, 0);
    assert.deepEqual(state.revoked, []);
});

test("古い取消要求の事前読取後に受諾が完了してもacceptedと店舗所有者を上書きしない", async (t) => {
    const { state, inviteDelegate } = setup(t);
    const read = deferred();
    const resume = deferred();
    replace(t, prisma.adminInvite, "findUnique", async (query: Query) => {
        const snapshot = await inviteDelegate.findUnique(query);
        read.resolve();
        await resume.promise;
        return snapshot;
    });
    const revoke = revokeRoute.POST(request("revoke"));
    await read.promise;
    clerkUserId = "accepted-owner";
    assert.equal((await acceptRoute.POST(request("accept"))).status, 200);
    resume.resolve();
    assert.equal((await revoke).status, 409);
    assert.equal(state.invites[0].status, "accepted");
    assert.equal(state.shop.ownerClerkUserId, "accepted-owner");
    assert.deepEqual(state.revoked, []);
    assert.deepEqual(state.audits.map((event) => event.action), ["invitation_accept"]);
});

test("取消が先に確定すればClerk待機中でも受諾できず店舗所有者は設定されない", async (t) => {
    const { state } = setup(t);
    const remote = deferred();
    const resume = deferred();
    remoteRevoke = async () => { remote.resolve(); await resume.promise; };
    const revoke = revokeRoute.POST(request("revoke"));
    await remote.promise;
    assert.equal(state.invites[0].status, "revoked");
    clerkUserId = "invitee";
    assert.equal((await acceptRoute.POST(request("accept"))).status, 404);
    resume.resolve();
    assert.equal((await revoke).status, 200);
    assert.equal(state.shop.ownerClerkUserId, null);
});

test("取消のClerk失敗でもローカル受諾を停止し、再試行で外部取消だけを完了できる", async (t) => {
    const { state } = setup(t);
    remoteRevoke = async () => { throw new Error("secret external failure"); };
    const failed = await revokeRoute.POST(request("revoke"));
    assert.equal(failed.status, 502);
    assert.doesNotMatch(await failed.text(), /secret external failure/);
    assert.equal(state.invites[0].status, "revoked");
    assert.equal(state.invites[0].clerkInvitationId, "clerk-old");
    remoteRevoke = async (id) => { state.revoked.push(id); };
    assert.equal((await revokeRoute.POST(request("revoke"))).status, 200);
    assert.equal(state.invites[0].clerkInvitationId, null);
    assert.equal((await revokeRoute.POST(request("revoke"))).status, 200);
    assert.deepEqual(state.revoked, ["clerk-old"]);
    assert.deepEqual(state.audits.map((event) => event.action), ["invitation_revoke"]);
    assert.deepEqual(state.audits[0].metadata, { actorClerkUserId: "user_platformAdmin" });
});

test("再送の新規Clerk招待作成中に受諾が完了すると新規招待を補償取消しacceptedを維持する", async (t) => {
    const { state } = setup(t);
    const remote = deferred();
    const resume = deferred();
    remoteCreate = async () => { remote.resolve(); await resume.promise; return { id: "clerk-new", url: "https://example.test/invite" }; };
    const resend = resendRoute.POST(request("resend"));
    await remote.promise;
    clerkUserId = "accepted-owner";
    assert.equal((await acceptRoute.POST(request("accept"))).status, 200);
    resume.resolve();
    assert.equal((await resend).status, 409);
    assert.equal(state.invites.length, 1);
    assert.equal(state.invites[0].status, "accepted");
    assert.equal(state.shop.ownerClerkUserId, "accepted-owner");
    assert.deepEqual(state.revoked, ["clerk-old", "clerk-new"]);
    assert.deepEqual(state.audits.map((event) => event.action), ["invitation_accept"]);
});

test("同じ招待の再送が競合しても未承認の置換は一件で、敗者のClerk招待を取消す", async (t) => {
    const { state } = setup(t);
    state.invites[0].clerkInvitationId = null;
    const bothCreated = deferred();
    let calls = 0;
    remoteCreate = async () => {
        const id = `clerk-new-${++calls}`;
        if (calls === 2) bothCreated.resolve();
        await bothCreated.promise;
        return { id, url: "https://example.test/invite" };
    };
    const responses = await Promise.all([resendRoute.POST(request("resend")), resendRoute.POST(request("resend"))]);
    assert.deepEqual(responses.map((response) => response.status).sort(), [200, 409]);
    assert.equal(state.invites.filter((invite) => invite.status === "pending").length, 1);
    assert.equal(state.invites[0].status, "revoked");
    assert.equal(state.revoked.length, 1);
    assert.notEqual(state.invites[1].clerkInvitationId, state.revoked[0]);
    assert.deepEqual(state.audits.map((event) => event.action), ["invitation_resend"]);
});

test("再送の外部作成失敗後は取消済みClerk IDを残さず再試行できる", async (t) => {
    const { state } = setup(t);
    remoteCreate = async () => { throw new Error("secret error detail"); };
    const failed = await resendRoute.POST(request("resend"));
    assert.equal(failed.status, 500);
    assert.doesNotMatch(await failed.text(), /secret error detail/);
    assert.equal(state.invites[0].status, "pending");
    assert.equal(state.invites[0].clerkInvitationId, null);
    remoteCreate = async () => ({ id: "clerk-new", url: "https://example.test/invite" });
    assert.equal((await resendRoute.POST(request("resend"))).status, 200);
    assert.deepEqual(state.revoked, ["clerk-old"]);
    assert.equal(state.invites[1].clerkInvitationId, "clerk-new");
});

test("再送のDB作成失敗は旧pending状態へロールバックしClerk新規招待を取消す", async (t) => {
    const { state, tx } = setup(t);
    tx.adminInvite.create = async () => { throw new Error("database internal detail"); };
    const response = await resendRoute.POST(request("resend"));
    assert.equal(response.status, 500);
    assert.doesNotMatch(await response.text(), /database internal detail/);
    assert.equal(state.invites.length, 1);
    assert.equal(state.invites[0].status, "pending");
    assert.deepEqual(state.revoked, ["clerk-old", "clerk-new-1"]);
    assert.deepEqual(state.audits, []);
});

test("再送の補償取消まで失敗しても成功監査や内部エラーを返さず復旧用イベントを残す", async (t) => {
    const { state, tx } = setup(t);
    const messages: string[] = [];
    t.mock.method(console, "error", (value: string) => { messages.push(value); });
    tx.adminInvite.create = async () => { throw new Error("database internal detail"); };
    remoteRevoke = async (id) => {
        state.revoked.push(id);
        if (id !== "clerk-old") throw new Error("private remote secret");
    };
    const response = await resendRoute.POST(request("resend"));
    assert.equal(response.status, 500);
    assert.equal(state.invites[0].status, "pending");
    assert.deepEqual(state.audits, []);
    assert.ok(messages.some((message) => {
        const event = JSON.parse(message);
        return event.operation === "invitation.resend.compensate" && event.category === "external_service";
    }));
    assert.doesNotMatch(messages.join("\n"), /private remote secret|database internal detail/);
});

test("他店舗を既に所有するユーザーの受諾は409で全更新を取り消す", async (t) => {
    const { state, tx } = setup(t);
    tx.user.findUnique = async () => ({ id: "app-other", clerkUserId: "invitee", email: "invitee@example.test", shop: { id: "other-shop" } } as unknown as NonNullable<typeof state.appUser>);
    clerkUserId = "invitee";
    assert.equal((await acceptRoute.POST(request("accept"))).status, 409);
    assert.equal(state.invites[0].status, "pending");
    assert.equal(state.shop.ownerClerkUserId, null);
    assert.deepEqual(state.audits, []);
});

test("招待受諾は本文のshopId/email/userIdを信用せずClerk本人情報だけで確定する", async (t) => {
    const { state } = setup(t);
    clerkUserId = "actual-invitee";
    const response = await acceptRoute.POST(request("accept", {
        shopId: "foreign-shop", email: "attacker@example.test", userId: "foreign-user",
    }));
    assert.equal(response.status, 200);
    assert.equal(state.shop.ownerClerkUserId, "actual-invitee");
    assert.equal(state.invites[0].shopId, "shop-1");
    assert.equal(state.invites[0].acceptedByClerkUserId, "actual-invitee");
    assert.equal(state.audits[0].actorUserId, "app-invitee");
});

test("招待受諾は未認証・取消済み・期限切れを拒否して店舗権限を付与しない", async (t) => {
    const { state } = setup(t);
    clerkUserId = null;
    assert.equal((await acceptRoute.POST(request("accept"))).status, 401);
    clerkUserId = "invitee";
    for (const status of ["revoked", "expired"] as const) {
        state.invites[0].status = status;
        assert.equal((await acceptRoute.POST(request("accept"))).status, 404);
    }
    assert.equal(state.shop.ownerClerkUserId, null);
    assert.deepEqual(state.audits, []);
});

test("招待作成の予期しないDB/Clerk内部情報はレスポンスへ公開しない", async (t) => {
    const { state } = setup(t);
    state.invites = [];
    remoteCreate = async () => { throw new Error("postgresql://user:password@example.test/private"); };
    const response = await createRoute.POST(request("create", { email: "invitee@example.test", shopName: "テスト店舗" }));
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { message: "招待の作成に失敗しました。" });
    assert.deepEqual(state.audits, []);
});

test("招待作成から本人受諾までの成功はDB確定後に操作者付きの監査を残す", async (t) => {
    const { state } = setup(t);
    state.invites = [];
    const created = await createRoute.POST(request("create", { email: "invitee@example.test", shopName: "テスト店舗" }));
    assert.equal(created.status, 201);
    assert.equal(state.invites[0].status, "pending");
    assert.deepEqual(state.audits[0].metadata, { actorClerkUserId: "user_platformAdmin" });
    clerkUserId = "user_invitee";
    assert.equal((await acceptRoute.POST(request("accept"))).status, 200);
    assert.equal(state.shop.ownerClerkUserId, "user_invitee");
    assert.equal(state.invites[0].status, "accepted");
    assert.deepEqual(state.audits.map((event) => event.action), ["invitation_create", "invitation_accept"]);
    assert.equal(state.audits[1].actorUserId, "app-invitee");
});
