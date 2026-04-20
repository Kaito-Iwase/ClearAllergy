-- Invite-only shop registration support.
-- Existing shops are kept active so the current public/admin flows keep working.

CREATE TYPE "InviteStatus" AS ENUM ('pending', 'accepted', 'revoked', 'expired', 'failed');

ALTER TABLE "Shop"
ADD COLUMN "ownerClerkUserId" TEXT,
ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "userId" DROP NOT NULL;

UPDATE "Shop"
SET
    "ownerClerkUserId" = "User"."clerkUserId",
    "isActive" = true
FROM "User"
WHERE "Shop"."userId" = "User"."id";

UPDATE "Shop"
SET "isActive" = true
WHERE "ownerClerkUserId" IS NULL
  AND "userId" IS NOT NULL;

CREATE TABLE "AdminInvite" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "status" "InviteStatus" NOT NULL DEFAULT 'pending',
    "clerkInvitationId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "invitedByClerkUserId" TEXT NOT NULL,
    "acceptedByClerkUserId" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminInvite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Shop_ownerClerkUserId_key" ON "Shop"("ownerClerkUserId");
CREATE UNIQUE INDEX "AdminInvite_clerkInvitationId_key" ON "AdminInvite"("clerkInvitationId");
CREATE INDEX "AdminInvite_email_status_idx" ON "AdminInvite"("email", "status");
CREATE INDEX "AdminInvite_shopId_status_idx" ON "AdminInvite"("shopId", "status");
CREATE INDEX "AdminInvite_status_idx" ON "AdminInvite"("status");
CREATE UNIQUE INDEX "AdminInvite_pending_email_key" ON "AdminInvite"("email") WHERE "status" = 'pending';
CREATE UNIQUE INDEX "AdminInvite_pending_shopId_key" ON "AdminInvite"("shopId") WHERE "status" = 'pending';

ALTER TABLE "Shop" DROP CONSTRAINT "Shop_userId_fkey";
ALTER TABLE "Shop"
ADD CONSTRAINT "Shop_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AdminInvite"
ADD CONSTRAINT "AdminInvite_shopId_fkey"
FOREIGN KEY ("shopId") REFERENCES "Shop"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
