import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
    isDatabaseUnavailableError,
    logDatabaseUnavailableError,
} from "@/lib/db-errors";
import { getIpFromHeaders } from "@/lib/request-ip";

type AdminAuditAction =
    | "auth_login_success"
    | "auth_login_failure"
    | "auth_google_login_start"
    | "auth_google_login_success"
    | "auth_google_login_failure"
    | "auth_register_attempt"
    | "auth_register_success"
    | "auth_register_failure"
    | "auth_onboarding_success"
    | "auth_onboarding_failure"
    | "menu_create"
    | "menu_update"
    | "menu_publish"
    | "menu_unpublish"
    | "menu_delete"
    | "shop_update"
    | "menu_image_upload"
    | "shop_image_upload";

type AdminAuditTargetType = "auth" | "menu" | "shop" | "image_upload";

// この関数は、管理画面の重要操作を監査ログへ残します。
// 「誰が・何を・いつ・成功したか」を追えるようにして、
// 公開事故や不正操作が起きた時に後から確認できるようにします。
export async function writeAdminAuditLog(args: {
    req: Request;
    actorUserId: string | null;
    actorShopId: string | null;
    action: AdminAuditAction;
    targetType: AdminAuditTargetType;
    targetId: string | null;
    success: boolean;
    metadata?: Prisma.InputJsonValue;
}) {
    try {
        const auditLogDelegate = (
            prisma as typeof prisma & {
                auditLog?: {
                    create: (args: { data: unknown }) => Promise<unknown>;
                };
            }
        ).auditLog;

        if (!auditLogDelegate) {
            return;
        }

        // 監査ログ書き込みの失敗で本来の更新処理まで止めないように、
        // ログ処理は補助扱いにしています。
        await auditLogDelegate.create({
            data: {
                actorUserId: args.actorUserId,
                actorShopId: args.actorShopId,
                action: args.action,
                targetType: args.targetType,
                targetId: args.targetId,
                success: args.success,
                ipAddress: getIpFromHeaders(args.req.headers),
                metadata: args.metadata,
            },
        });
    } catch (error) {
        if (isDatabaseUnavailableError(error)) {
            logDatabaseUnavailableError(
                {
                    scope: "audit-log",
                    operation: "auditLog.create",
                    details: {
                        action: args.action,
                        success: args.success,
                    },
                },
                error,
            );
            return;
        }

        console.error("audit log failed", error);
    }
}
