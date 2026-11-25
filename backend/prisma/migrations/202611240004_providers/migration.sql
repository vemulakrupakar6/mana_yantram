-- CreateEnum
CREATE TYPE "ProviderType" AS ENUM ('INDIVIDUAL', 'FPO', 'CHC', 'AGENCY');

-- CreateEnum
CREATE TYPE "ProviderStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'RETURNED', 'APPROVED', 'REJECTED', 'SUSPENDED', 'BLACKLISTED');

-- CreateEnum
CREATE TYPE "CoverageMode" AS ENUM ('RADIUS', 'AREAS');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'ACCEPTED', 'RETURNED');

-- CreateEnum
CREATE TYPE "VerificationAction" AS ENUM ('SUBMIT', 'APPROVE', 'RETURN', 'REJECT', 'SUSPEND', 'BLACKLIST', 'REINSTATE');

-- CreateEnum
CREATE TYPE "TravelMode" AS ENUM ('NONE', 'FLAT', 'PER_KM');

-- CreateTable
CREATE TABLE "providers" (
    "id" UUID NOT NULL,
    "provider_no" VARCHAR(20) NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "ProviderType" NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "contact_person" VARCHAR(150) NOT NULL,
    "mobile" VARCHAR(10) NOT NULL,
    "email" VARCHAR(254),
    "address_line" VARCHAR(300) NOT NULL,
    "pincode" CHAR(6),
    "district_id" UUID NOT NULL,
    "mandal_id" UUID NOT NULL,
    "village_id" UUID NOT NULL,
    "base_latitude" DECIMAL(9,6) NOT NULL,
    "base_longitude" DECIMAL(9,6) NOT NULL,
    "registration_no" VARCHAR(60),
    "gstin" CHAR(15),
    "coverage_mode" "CoverageMode",
    "coverage_radius_km" INTEGER,
    "status" "ProviderStatus" NOT NULL DEFAULT 'DRAFT',
    "submitted_at" TIMESTAMPTZ(3),
    "approved_at" TIMESTAMPTZ(3),
    "approved_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_documents" (
    "id" UUID NOT NULL,
    "provider_id" UUID NOT NULL,
    "document_type_code" VARCHAR(40) NOT NULL,
    "equipment_id" UUID,
    "file_id" UUID NOT NULL,
    "status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "remarks" VARCHAR(500),
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMPTZ(3),
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "provider_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_bank_accounts" (
    "id" UUID NOT NULL,
    "provider_id" UUID NOT NULL,
    "holder_name" VARCHAR(150) NOT NULL,
    "account_no_enc" TEXT NOT NULL,
    "account_no_last4" CHAR(4) NOT NULL,
    "ifsc" CHAR(11) NOT NULL,
    "bank_name" VARCHAR(120),
    "branch_name" VARCHAR(160),
    "status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "remarks" VARCHAR(500),
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMPTZ(3),
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "provider_bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_coverage_areas" (
    "id" UUID NOT NULL,
    "provider_id" UUID NOT NULL,
    "mandal_id" UUID,
    "village_id" UUID,

    CONSTRAINT "provider_coverage_areas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_working_hours" (
    "provider_id" UUID NOT NULL,
    "weekday" INTEGER NOT NULL,
    "start_minute" INTEGER NOT NULL,
    "end_minute" INTEGER NOT NULL,

    CONSTRAINT "provider_working_hours_pkey" PRIMARY KEY ("provider_id","weekday")
);

-- CreateTable
CREATE TABLE "provider_verifications" (
    "id" UUID NOT NULL,
    "provider_id" UUID NOT NULL,
    "action" "VerificationAction" NOT NULL,
    "from_status" "ProviderStatus" NOT NULL,
    "to_status" "ProviderStatus" NOT NULL,
    "remarks" VARCHAR(1000),
    "field_remarks" JSONB,
    "actor_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provider_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equipment" (
    "id" UUID NOT NULL,
    "provider_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "make" VARCHAR(80) NOT NULL,
    "model" VARCHAR(80) NOT NULL,
    "year" INTEGER NOT NULL,
    "capacity_value" DECIMAL(10,2),
    "capacity_unit" VARCHAR(20),
    "implements" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "ActiveStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "equipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equipment_photos" (
    "equipment_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL,

    CONSTRAINT "equipment_photos_pkey" PRIMARY KEY ("equipment_id","file_id")
);

-- CreateTable
CREATE TABLE "equipment_units" (
    "id" UUID NOT NULL,
    "equipment_id" UUID NOT NULL,
    "unit_label" VARCHAR(40) NOT NULL,
    "registration_no" VARCHAR(20),
    "drone_uin" VARCHAR(30),
    "status" "ActiveStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "equipment_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equipment_services" (
    "id" UUID NOT NULL,
    "equipment_id" UUID NOT NULL,
    "operation_id" UUID NOT NULL,
    "pricing_basis" "PricingBasis" NOT NULL,
    "rate_paise" INTEGER NOT NULL,
    "min_charge_paise" INTEGER NOT NULL DEFAULT 0,
    "travel_mode" "TravelMode" NOT NULL DEFAULT 'NONE',
    "travel_flat_paise" INTEGER,
    "travel_per_km_paise" INTEGER,
    "free_radius_km" DECIMAL(6,2),
    "work_rate_acres_per_hour" DECIMAL(6,2) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "equipment_services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_caps" (
    "id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "operation_id" UUID NOT NULL,
    "district_id" UUID,
    "pricing_basis" "PricingBasis" NOT NULL,
    "max_rate_paise" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "rate_caps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "availability_blocks" (
    "id" UUID NOT NULL,
    "equipment_unit_id" UUID NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "reason" VARCHAR(200) NOT NULL,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "availability_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operators" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "provider_id" UUID NOT NULL,
    "full_name" VARCHAR(150) NOT NULL,
    "licence_no" VARCHAR(40),
    "licence_file_id" UUID,
    "status" "ActiveStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "operators_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operator_equipment" (
    "operator_id" UUID NOT NULL,
    "equipment_id" UUID NOT NULL,

    CONSTRAINT "operator_equipment_pkey" PRIMARY KEY ("operator_id","equipment_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "providers_provider_no_key" ON "providers"("provider_no");

-- CreateIndex
CREATE UNIQUE INDEX "providers_user_id_key" ON "providers"("user_id");

-- CreateIndex
CREATE INDEX "providers_status_district_id_idx" ON "providers"("status", "district_id");

-- CreateIndex
CREATE INDEX "providers_district_id_mandal_id_idx" ON "providers"("district_id", "mandal_id");

-- CreateIndex
CREATE UNIQUE INDEX "provider_documents_file_id_key" ON "provider_documents"("file_id");

-- CreateIndex
CREATE INDEX "provider_documents_provider_id_status_idx" ON "provider_documents"("provider_id", "status");

-- CreateIndex
CREATE INDEX "provider_documents_equipment_id_idx" ON "provider_documents"("equipment_id");

-- CreateIndex
CREATE UNIQUE INDEX "provider_bank_accounts_provider_id_key" ON "provider_bank_accounts"("provider_id");

-- CreateIndex
CREATE INDEX "provider_coverage_areas_provider_id_idx" ON "provider_coverage_areas"("provider_id");

-- CreateIndex
CREATE INDEX "provider_verifications_provider_id_created_at_idx" ON "provider_verifications"("provider_id", "created_at");

-- CreateIndex
CREATE INDEX "equipment_provider_id_status_idx" ON "equipment"("provider_id", "status");

-- CreateIndex
CREATE INDEX "equipment_category_id_idx" ON "equipment"("category_id");

-- CreateIndex
CREATE UNIQUE INDEX "equipment_photos_file_id_key" ON "equipment_photos"("file_id");

-- CreateIndex
CREATE UNIQUE INDEX "equipment_units_equipment_id_unit_label_key" ON "equipment_units"("equipment_id", "unit_label");

-- CreateIndex
CREATE INDEX "equipment_services_operation_id_idx" ON "equipment_services"("operation_id");

-- CreateIndex
CREATE UNIQUE INDEX "equipment_services_equipment_id_operation_id_key" ON "equipment_services"("equipment_id", "operation_id");

-- CreateIndex
CREATE INDEX "rate_caps_category_id_operation_id_idx" ON "rate_caps"("category_id", "operation_id");

-- CreateIndex
CREATE INDEX "availability_blocks_equipment_unit_id_starts_at_idx" ON "availability_blocks"("equipment_unit_id", "starts_at");

-- CreateIndex
CREATE UNIQUE INDEX "operators_user_id_key" ON "operators"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "operators_licence_file_id_key" ON "operators"("licence_file_id");

-- CreateIndex
CREATE INDEX "operators_provider_id_status_idx" ON "operators"("provider_id", "status");

-- CreateIndex
CREATE INDEX "operator_equipment_equipment_id_idx" ON "operator_equipment"("equipment_id");

-- AddForeignKey
ALTER TABLE "providers" ADD CONSTRAINT "providers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "providers" ADD CONSTRAINT "providers_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "providers" ADD CONSTRAINT "providers_district_id_fkey" FOREIGN KEY ("district_id") REFERENCES "districts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "providers" ADD CONSTRAINT "providers_mandal_id_fkey" FOREIGN KEY ("mandal_id") REFERENCES "mandals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "providers" ADD CONSTRAINT "providers_village_id_fkey" FOREIGN KEY ("village_id") REFERENCES "villages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_documents" ADD CONSTRAINT "provider_documents_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_documents" ADD CONSTRAINT "provider_documents_document_type_code_fkey" FOREIGN KEY ("document_type_code") REFERENCES "document_types"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_documents" ADD CONSTRAINT "provider_documents_equipment_id_fkey" FOREIGN KEY ("equipment_id") REFERENCES "equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_documents" ADD CONSTRAINT "provider_documents_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_documents" ADD CONSTRAINT "provider_documents_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_bank_accounts" ADD CONSTRAINT "provider_bank_accounts_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_bank_accounts" ADD CONSTRAINT "provider_bank_accounts_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_coverage_areas" ADD CONSTRAINT "provider_coverage_areas_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_coverage_areas" ADD CONSTRAINT "provider_coverage_areas_mandal_id_fkey" FOREIGN KEY ("mandal_id") REFERENCES "mandals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_coverage_areas" ADD CONSTRAINT "provider_coverage_areas_village_id_fkey" FOREIGN KEY ("village_id") REFERENCES "villages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_working_hours" ADD CONSTRAINT "provider_working_hours_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_verifications" ADD CONSTRAINT "provider_verifications_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_verifications" ADD CONSTRAINT "provider_verifications_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "service_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_photos" ADD CONSTRAINT "equipment_photos_equipment_id_fkey" FOREIGN KEY ("equipment_id") REFERENCES "equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_photos" ADD CONSTRAINT "equipment_photos_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_units" ADD CONSTRAINT "equipment_units_equipment_id_fkey" FOREIGN KEY ("equipment_id") REFERENCES "equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_services" ADD CONSTRAINT "equipment_services_equipment_id_fkey" FOREIGN KEY ("equipment_id") REFERENCES "equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_services" ADD CONSTRAINT "equipment_services_operation_id_fkey" FOREIGN KEY ("operation_id") REFERENCES "operations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_caps" ADD CONSTRAINT "rate_caps_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "service_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_caps" ADD CONSTRAINT "rate_caps_operation_id_fkey" FOREIGN KEY ("operation_id") REFERENCES "operations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_caps" ADD CONSTRAINT "rate_caps_district_id_fkey" FOREIGN KEY ("district_id") REFERENCES "districts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availability_blocks" ADD CONSTRAINT "availability_blocks_equipment_unit_id_fkey" FOREIGN KEY ("equipment_unit_id") REFERENCES "equipment_units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availability_blocks" ADD CONSTRAINT "availability_blocks_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operators" ADD CONSTRAINT "operators_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operators" ADD CONSTRAINT "operators_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operators" ADD CONSTRAINT "operators_licence_file_id_fkey" FOREIGN KEY ("licence_file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operator_equipment" ADD CONSTRAINT "operator_equipment_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "operators"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operator_equipment" ADD CONSTRAINT "operator_equipment_equipment_id_fkey" FOREIGN KEY ("equipment_id") REFERENCES "equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Raw SQL Prisma cannot model (PostgreSQL 15+ for NULLS NOT DISTINCT)
CREATE SEQUENCE provider_no_seq;
CREATE UNIQUE INDEX uq_provider_document ON provider_documents
  (provider_id, document_type_code, equipment_id) NULLS NOT DISTINCT;
ALTER TABLE provider_coverage_areas ADD CONSTRAINT chk_one_area CHECK (num_nonnulls(mandal_id, village_id) = 1);
CREATE UNIQUE INDEX uq_coverage_area ON provider_coverage_areas (provider_id, mandal_id, village_id) NULLS NOT DISTINCT;
ALTER TABLE provider_working_hours ADD CONSTRAINT chk_hours CHECK
  (weekday BETWEEN 1 AND 7 AND start_minute >= 0 AND end_minute <= 1440 AND start_minute < end_minute);
ALTER TABLE providers ADD CONSTRAINT chk_radius CHECK
  (coverage_radius_km IS NULL OR coverage_radius_km BETWEEN 1 AND 100);
ALTER TABLE equipment ADD CONSTRAINT chk_equipment_year CHECK (year BETWEEN 1960 AND 2100);
ALTER TABLE equipment_services ADD CONSTRAINT chk_service_money CHECK (
  rate_paise > 0 AND min_charge_paise >= 0 AND work_rate_acres_per_hour > 0 AND
  ((travel_mode = 'NONE'   AND travel_flat_paise IS NULL AND travel_per_km_paise IS NULL) OR
   (travel_mode = 'FLAT'   AND travel_flat_paise >= 0    AND travel_per_km_paise IS NULL) OR
   (travel_mode = 'PER_KM' AND travel_per_km_paise > 0   AND travel_flat_paise IS NULL AND free_radius_km >= 0)));
CREATE UNIQUE INDEX uq_rate_cap ON rate_caps (category_id, operation_id, district_id, pricing_basis) NULLS NOT DISTINCT;
ALTER TABLE rate_caps ADD CONSTRAINT chk_cap CHECK (max_rate_paise > 0);
ALTER TABLE availability_blocks ADD CONSTRAINT chk_block_period CHECK (ends_at > starts_at);
