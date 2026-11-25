-- Normalise existing mobiles BEFORE the column type change and unique index.
UPDATE users SET mobile = right(regexp_replace(mobile, '\D', '', 'g'), 10) WHERE mobile IS NOT NULL;
UPDATE users SET mobile = NULL WHERE mobile IS NOT NULL AND mobile !~ '^[6-9][0-9]{9}$';
UPDATE users u SET mobile = NULL
  WHERE mobile IS NOT NULL AND EXISTS (
    SELECT 1 FROM users o WHERE o.mobile = u.mobile AND (o.created_at, o.id) < (u.created_at, u.id));

-- CreateEnum
CREATE TYPE "JurisdictionLevel" AS ENUM ('STATE', 'DISTRICT', 'MANDAL');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "created_by_id" UUID,
ADD COLUMN     "deactivated_at" TIMESTAMPTZ(3),
ADD COLUMN     "deactivated_by_id" UUID,
ADD COLUMN     "deactivation_reason" VARCHAR(300),
ADD COLUMN     "must_change_password" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "mobile" SET DATA TYPE VARCHAR(10);

-- AlterTable
ALTER TABLE "consents" ADD COLUMN     "captured_by_id" UUID,
ADD COLUMN     "purposes" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "user_jurisdictions" (
    "user_id" UUID NOT NULL,
    "level" "JurisdictionLevel" NOT NULL,
    "district_id" UUID,
    "mandal_id" UUID,

    CONSTRAINT "user_jurisdictions_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "districts" (
    "id" UUID NOT NULL,
    "lgd_code" VARCHAR(10) NOT NULL,
    "name_en" VARCHAR(100) NOT NULL,
    "name_te" VARCHAR(100) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "districts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mandals" (
    "id" UUID NOT NULL,
    "district_id" UUID NOT NULL,
    "lgd_code" VARCHAR(10) NOT NULL,
    "name_en" VARCHAR(100) NOT NULL,
    "name_te" VARCHAR(100) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "mandals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "villages" (
    "id" UUID NOT NULL,
    "mandal_id" UUID NOT NULL,
    "lgd_code" VARCHAR(10) NOT NULL,
    "name_en" VARCHAR(120) NOT NULL,
    "name_te" VARCHAR(120) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "villages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_jurisdictions_district_id_idx" ON "user_jurisdictions"("district_id");

-- CreateIndex
CREATE INDEX "user_jurisdictions_mandal_id_idx" ON "user_jurisdictions"("mandal_id");

-- CreateIndex
CREATE UNIQUE INDEX "districts_lgd_code_key" ON "districts"("lgd_code");

-- CreateIndex
CREATE UNIQUE INDEX "mandals_lgd_code_key" ON "mandals"("lgd_code");

-- CreateIndex
CREATE INDEX "mandals_district_id_idx" ON "mandals"("district_id");

-- CreateIndex
CREATE UNIQUE INDEX "villages_lgd_code_key" ON "villages"("lgd_code");

-- CreateIndex
CREATE INDEX "villages_mandal_id_idx" ON "villages"("mandal_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_mobile_key" ON "users"("mobile");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_deactivated_by_id_fkey" FOREIGN KEY ("deactivated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consents" ADD CONSTRAINT "consents_captured_by_id_fkey" FOREIGN KEY ("captured_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_jurisdictions" ADD CONSTRAINT "user_jurisdictions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_jurisdictions" ADD CONSTRAINT "user_jurisdictions_district_id_fkey" FOREIGN KEY ("district_id") REFERENCES "districts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_jurisdictions" ADD CONSTRAINT "user_jurisdictions_mandal_id_fkey" FOREIGN KEY ("mandal_id") REFERENCES "mandals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mandals" ADD CONSTRAINT "mandals_district_id_fkey" FOREIGN KEY ("district_id") REFERENCES "districts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "villages" ADD CONSTRAINT "villages_mandal_id_fkey" FOREIGN KEY ("mandal_id") REFERENCES "mandals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Raw constraints Prisma cannot model
ALTER TABLE user_jurisdictions ADD CONSTRAINT chk_jurisdiction_level CHECK (
  (level = 'STATE'    AND district_id IS NULL     AND mandal_id IS NULL) OR
  (level = 'DISTRICT' AND district_id IS NOT NULL AND mandal_id IS NULL) OR
  (level = 'MANDAL'   AND district_id IS NOT NULL AND mandal_id IS NOT NULL));
