ALTER TABLE "Shop"
ADD COLUMN "prefecture" TEXT,
ADD COLUMN "city" TEXT,
ADD COLUMN "nearestStation" TEXT,
ADD COLUMN "category" TEXT,
ADD COLUMN "latitude" DOUBLE PRECISION,
ADD COLUMN "longitude" DOUBLE PRECISION,
ADD COLUMN "googlePlaceId" TEXT;

CREATE UNIQUE INDEX "Shop_googlePlaceId_key" ON "Shop"("googlePlaceId");
