-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER');

-- CreateEnum
CREATE TYPE "RelationType" AS ENUM ('FATHER', 'HUSBAND');

-- CreateEnum
CREATE TYPE "CropSeason" AS ENUM ('KHARIF', 'RABI', 'SUMMER');

-- CreateEnum
CREATE TYPE "ActiveStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateTable
CREATE TABLE "farmers" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "full_name" VARCHAR(150) NOT NULL,
    "relation_type" "RelationType" NOT NULL,
    "relative_name" VARCHAR(150) NOT NULL,
    "gender" "Gender" NOT NULL,
    "district_id" UUID NOT NULL,
    "mandal_id" UUID NOT NULL,
    "village_id" UUID NOT NULL,
    "aadhaar_last4" CHAR(4),
    "aadhaar_hash" CHAR(64),
    "is_aadhaar_verified" BOOLEAN NOT NULL DEFAULT false,
    "notify_sms" BOOLEAN NOT NULL DEFAULT true,
    "notify_in_app" BOOLEAN NOT NULL DEFAULT true,
    "notify_push" BOOLEAN NOT NULL DEFAULT true,
    "registered_by_user_id" UUID,
    "status" "ActiveStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "farmers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "farmer_plots" (
    "id" UUID NOT NULL,
    "farmer_id" UUID NOT NULL,
    "survey_no" VARCHAR(50) NOT NULL,
    "extent_acres" DECIMAL(10,2) NOT NULL,
    "village_id" UUID NOT NULL,
    "latitude" DECIMAL(9,6) NOT NULL,
    "longitude" DECIMAL(9,6) NOT NULL,
    "boundary" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "farmer_plots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plot_crops" (
    "plot_id" UUID NOT NULL,
    "crop_id" UUID NOT NULL,
    "season" "CropSeason" NOT NULL,
    "year" INTEGER NOT NULL,

    CONSTRAINT "plot_crops_pkey" PRIMARY KEY ("plot_id","crop_id","season","year")
);

-- CreateIndex
CREATE UNIQUE INDEX "farmers_user_id_key" ON "farmers"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "farmers_aadhaar_hash_key" ON "farmers"("aadhaar_hash");

-- CreateIndex
CREATE INDEX "farmers_district_id_mandal_id_village_id_idx" ON "farmers"("district_id", "mandal_id", "village_id");

-- CreateIndex
CREATE INDEX "farmers_registered_by_user_id_idx" ON "farmers"("registered_by_user_id");

-- CreateIndex
CREATE INDEX "farmer_plots_farmer_id_is_active_idx" ON "farmer_plots"("farmer_id", "is_active");

-- CreateIndex
CREATE INDEX "plot_crops_crop_id_idx" ON "plot_crops"("crop_id");

-- AddForeignKey
ALTER TABLE "farmers" ADD CONSTRAINT "farmers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farmers" ADD CONSTRAINT "farmers_registered_by_user_id_fkey" FOREIGN KEY ("registered_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farmers" ADD CONSTRAINT "farmers_district_id_fkey" FOREIGN KEY ("district_id") REFERENCES "districts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farmers" ADD CONSTRAINT "farmers_mandal_id_fkey" FOREIGN KEY ("mandal_id") REFERENCES "mandals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farmers" ADD CONSTRAINT "farmers_village_id_fkey" FOREIGN KEY ("village_id") REFERENCES "villages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farmer_plots" ADD CONSTRAINT "farmer_plots_farmer_id_fkey" FOREIGN KEY ("farmer_id") REFERENCES "farmers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farmer_plots" ADD CONSTRAINT "farmer_plots_village_id_fkey" FOREIGN KEY ("village_id") REFERENCES "villages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plot_crops" ADD CONSTRAINT "plot_crops_plot_id_fkey" FOREIGN KEY ("plot_id") REFERENCES "farmer_plots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plot_crops" ADD CONSTRAINT "plot_crops_crop_id_fkey" FOREIGN KEY ("crop_id") REFERENCES "crops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Raw constraints Prisma cannot model
ALTER TABLE farmer_plots ADD CONSTRAINT chk_plot_extent CHECK (extent_acres > 0 AND extent_acres <= 1000);
ALTER TABLE farmers ADD CONSTRAINT chk_aadhaar_pair CHECK ((aadhaar_last4 IS NULL) = (aadhaar_hash IS NULL));
ALTER TABLE plot_crops ADD CONSTRAINT chk_crop_year CHECK (year BETWEEN 2000 AND 2100);
