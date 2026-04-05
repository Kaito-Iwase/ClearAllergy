type RateLimitEntry = {
    count: number;
    resetAt: number;
};

type RateLimitResult = {
    allowed: boolean;
    remaining: number;
    retryAfterSeconds: number;
};

const globalStore = globalThis as typeof globalThis & {
    __clearAllergyRateLimitStore?: Map<string, RateLimitEntry>;
};

const store =
    globalStore.__clearAllergyRateLimitStore ??
    (globalStore.__clearAllergyRateLimitStore = new Map<string, RateLimitEntry>());

// この関数は、短時間の連続リクエストを抑える簡易レート制限です。
// いまはメモリ上の Map を使う最小構成なので、単一インスタンスでは有効ですが、
// 複数台構成では共有されません。本番を大きくするなら Redis などへ移す前提です。
export function consumeRateLimit(args: {
    key: string;
    limit: number;
    windowMs: number;
}): RateLimitResult {
    const now = Date.now();
    const existing = store.get(args.key);

    if (!existing || existing.resetAt <= now) {
        store.set(args.key, {
            count: 1,
            resetAt: now + args.windowMs,
        });

        return {
            allowed: true,
            remaining: Math.max(0, args.limit - 1),
            retryAfterSeconds: Math.ceil(args.windowMs / 1000),
        };
    }

    if (existing.count >= args.limit) {
        return {
            allowed: false,
            remaining: 0,
            retryAfterSeconds: Math.max(
                1,
                Math.ceil((existing.resetAt - now) / 1000),
            ),
        };
    }

    existing.count += 1;
    store.set(args.key, existing);

    return {
        allowed: true,
        remaining: Math.max(0, args.limit - existing.count),
        retryAfterSeconds: Math.max(
            1,
            Math.ceil((existing.resetAt - now) / 1000),
        ),
    };
}
