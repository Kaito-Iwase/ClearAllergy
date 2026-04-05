import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getIpFromHeaders } from "@/lib/request-ip";

type AdminAuditAction =
    | "menu_create"
    | "menu_update"
    | "menu_publish"
    | "menu_unpublish"
    | "menu_delete"
    | "shop_update"
    | "menu_image_upload"
    | "shop_image_upload";

type AdminAuditTargetType = "menu" | "shop" | "image_upload";

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
        console.error("audit log failed", error);
    }
}
