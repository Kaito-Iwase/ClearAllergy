export type AdminRegistrationMode = "disabled" | "invite_only" | "open";

// この関数は、環境変数から現在の登録モードを読み取ります。
// 想定外の値が来た時は安全側で "disabled" に倒します。
export function getAdminRegistrationMode(): AdminRegistrationMode {
    const raw = process.env.ADMIN_REGISTRATION_MODE?.trim().toLowerCase();

    if (raw === "open" || raw === "invite_only" || raw === "disabled") {
        return raw;
    }

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
