import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import Module, { createRequire } from "node:module";
import React, { isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

type StateCell = { value: unknown };
type Scenario = {
    status: string;
    passwordError: unknown;
    supportedSecondFactors: { strategy: string }[];
};
type Harness = ReturnType<typeof setup>;
let active: Harness;

const loader = Module as unknown as { _load: (id: string, ...args: unknown[]) => unknown };
const originalLoad = loader._load;
const requireForTest = createRequire(import.meta.url);
let Login: typeof import("../features/admin/auth/components/AdminLoginPageClient").default;
try {
    loader._load = function (id, ...args) {
        if (id === "react") return {
            ...React,
            useState(initial: unknown) {
                const index = active.cursor++;
                const cell = active.cells[index] ?? (active.cells[index] = { value: initial });
                return [cell.value, (value: unknown) => { cell.value = value; }];
            },
        };
        if (id === "next/navigation") return { useRouter: () => ({ push: (url: string) => active.calls.push(`push:${url}`) }) };
        if (id === "@clerk/nextjs") return { useSignIn: () => ({ signIn: active.signIn, fetchStatus: "idle" }), SignOutButton: "div" };
        if (id === "next/link") return "a";
        if (id === "@/components/layout/BrandLogo" || id === "@/features/admin/auth/components/AdminGoogleAuthButton") return () => null;
        return originalLoad.call(this, id, ...args);
    };
    Login = requireForTest("../features/admin/auth/components/AdminLoginPageClient.tsx").default;
} finally {
    loader._load = originalLoad;
}

function elements(node: ReactNode): React.ReactElement<Record<string, unknown>>[] {
    if (Array.isArray(node)) return node.flatMap(elements);
    if (!isValidElement<Record<string, unknown>>(node)) return [];
    return [node, ...elements(node.props.children as ReactNode)];
}

function setup(t: TestContext, changes: Partial<Scenario> = {}) {
    const scenario: Scenario = { status: "complete", passwordError: null, supportedSecondFactors: [], ...changes };
    const calls: string[] = [];
    const signIn = {
        get status() { return scenario.status; },
        get supportedSecondFactors() { return scenario.supportedSecondFactors; },
        reset: async () => { calls.push("reset"); return { error: null }; },
        password: async () => { calls.push("password"); return { error: scenario.passwordError }; },
        finalize: async () => { calls.push("finalize"); return { error: null }; },
        mfa: {
            sendEmailCode: async () => { calls.push("sendEmailCode"); return { error: null }; },
            verifyEmailCode: async () => { calls.push("verifyEmailCode"); return { error: null }; },
        },
    };
    t.mock.method(globalThis, "fetch", async (url: string, options: RequestInit) => {
        assert.equal(url, "/api/admin/auth/login");
        const body = JSON.parse(String(options.body)) as { mode: string; success?: boolean; reason?: string };
        calls.push(body.mode === "result" ? `result:${body.success}:${body.reason ?? ""}` : body.mode);
        return new Response(null, { status: 204 });
    });
    const harness = {
        scenario, calls, signIn, cells: [] as StateCell[], cursor: 0,
        render() { active = harness; harness.cursor = 0; return Login({}); },
        change(id: string, value: string) {
            const input = elements(harness.render()).find((element) => element.props.id === id);
            assert.ok(input);
            (input.props.onChange as (event: { target: { value: string } }) => void)({ target: { value } });
        },
        async submit() {
            const form = elements(harness.render()).find((element) => element.type === "form");
            assert.ok(form);
            await (form.props.onSubmit as (event: { preventDefault: () => void }) => Promise<void>)({ preventDefault() {} });
        },
        html() { return renderToStaticMarkup(harness.render()); },
    };
    harness.change("email", "owner@example.invalid");
    harness.change("password", "synthetic-password");
    return harness;
}

test("通常の成功は既存のfinalizeと成功通知・店舗画面遷移を維持する", async (t) => {
    const state = setup(t);
    await state.submit();
    assert.deepEqual(state.calls, ["precheck", "reset", "password", "finalize", "result:true:", "push:/admin/shop"]);
    assert.doesNotMatch(state.html(), /id="login-error"|管理画面へ進む/);
});

test("通常の認証失敗はpassword_rejectedと従来の表示を維持する", async (t) => {
    const state = setup(t, { passwordError: { errors: [{ code: "form_password_incorrect" }] } });
    await state.submit();
    assert.deepEqual(state.calls, ["precheck", "reset", "password", "result:false:password_rejected"]);
    assert.match(state.html(), /メールアドレスまたはパスワードを確認してください/);
    assert.doesNotMatch(state.html(), /管理画面へ進む/);
});

test("session_existsは成功・password拒否として通知せず、固定説明と既存管理導線だけを表示する", async (t) => {
    const state = setup(t, { passwordError: { errors: [{ code: "session_exists", message: "secret-like-value-do-not-display" }] } });
    await state.submit();
    assert.deepEqual(state.calls, ["precheck", "reset", "password"]);
    const html = state.html();
    assert.match(html, /既存のログインセッションが検出されました/);
    assert.match(html, /この画面ではログイン完了を確認できていません/);
    assert.match(html, /再ログインは繰り返さず/);
    assert.match(html, /<a href="\/admin"[^>]*>管理画面へ進む<\/a>/);
    assert.doesNotMatch(html, /secret-like-value-do-not-display|メールアドレスまたはパスワードを確認してください/);
});

test("messageの文字列や不正なerrors形状をsession_existsと判定しない", async (t) => {
    const state = setup(t, { passwordError: { errors: "session_exists", message: "session_exists" } });
    await state.submit();
    assert.ok(state.calls.includes("result:false:password_rejected"));
    assert.doesNotMatch(state.html(), /管理画面へ進む/);
});

test("未完MFAはコード入力へ進み、検証後も未完なら成功通知・遷移せず専用失敗に分類する", async (t) => {
    const state = setup(t, { status: "needs_second_factor", supportedSecondFactors: [{ strategy: "email_code" }] });
    await state.submit();
    assert.deepEqual(state.calls, ["precheck", "reset", "password", "sendEmailCode"]);
    assert.match(state.html(), /確認コードをメールで送信しました/);
    state.change("emailCode", "synthetic-code");
    await state.submit();
    assert.deepEqual(state.calls, ["precheck", "reset", "password", "sendEmailCode", "verifyEmailCode", "result:false:email_code_incomplete"]);
    assert.match(state.html(), /追加認証を完了できませんでした/);
    assert.doesNotMatch(state.html(), /管理画面へ進む/);
});

test("未対応の追加認証は既存の未対応表示を維持し、成功・password拒否へ分類しない", async (t) => {
    const state = setup(t, { status: "needs_client_trust", supportedSecondFactors: [{ strategy: "totp" }] });
    await state.submit();
    assert.deepEqual(state.calls, ["precheck", "reset", "password"]);
    assert.match(state.html(), /この画面では email code 以外の方式には未対応です/);
    assert.doesNotMatch(state.html(), /管理画面へ進む/);
});
