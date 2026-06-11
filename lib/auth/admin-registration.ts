export type AdminRegistrationMode = "disabled" | "invite_only" | "open";

// A方式では店舗の自己登録は使わず、Clerk招待 + /api/invitations/accept に寄せます。
// 旧環境変数が残っていても自由登録を再度開かないよう、常に disabled に倒します。
export function getAdminRegistrationMode(): AdminRegistrationMode {
    return "disabled";
}

// 招待制モードでは、環境変数のトークンと一致した時だけ通します。
// ここを通さないと、URL を知っているだけで登録できてしまうため重要です。
export function isAdminRegistrationInviteValid(inviteToken: string | null) {
    const expected = process.env.ADMIN_REGISTRATION_INVITE_TOKEN?.trim();

    if (!expected) {
        return false;
    }

    return inviteToken === expected;
}

// 登録画面と登録 API の両方で同じ判定を使うための共通ガードです。
// 画面だけ閉じても API が開いていると意味がないので、必ずサーバー側でも使います。
export function getAdminRegistrationGuard(args: {
    inviteToken: string | null;
}) {
    const mode = getAdminRegistrationMode();

    if (mode === "open") {
        return {
            allowed: true,
            mode,
            message:
                "現在は公開登録モードです。本番では BOT 登録やスパム店舗作成の危険があります。",
        } as const;
    }

    if (mode === "invite_only") {
        const inviteAccepted = isAdminRegistrationInviteValid(args.inviteToken);
        return inviteAccepted
            ? {
                  allowed: true,
                  mode,
                  message: null,
              }
            : {
                  allowed: false,
                  mode,
                  message:
                      "この登録画面は招待制です。有効な招待トークンが必要です。",
              };
    }

    return {
        allowed: false,
        mode,
        message: "現在、店舗アカウントの自己登録は停止しています。",
    } as const;
}
