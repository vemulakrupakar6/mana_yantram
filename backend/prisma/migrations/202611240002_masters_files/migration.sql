-- CreateEnum
CREATE TYPE "PricingBasis" AS ENUM ('ACRE', 'HOUR', 'DAY');

-- CreateEnum
CREATE TYPE "DocumentScope" AS ENUM ('PROVIDER', 'EQUIPMENT');

-- CreateEnum
CREATE TYPE "FileBucket" AS ENUM ('DOCUMENT', 'EQUIPMENT_PHOTO');

-- CreateTable
CREATE TABLE "service_categories" (
    "id" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name_en" VARCHAR(100) NOT NULL,
    "name_te" VARCHAR(100) NOT NULL,
    "requires_pilot_licence" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "service_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operations" (
    "id" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name_en" VARCHAR(100) NOT NULL,
    "name_te" VARCHAR(100) NOT NULL,
    "default_pricing_basis" "PricingBasis" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "operations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "category_operations" (
    "category_id" UUID NOT NULL,
    "operation_id" UUID NOT NULL,

    CONSTRAINT "category_operations_pkey" PRIMARY KEY ("category_id","operation_id")
);

-- CreateTable
CREATE TABLE "document_types" (
    "code" VARCHAR(40) NOT NULL,
    "name_en" VARCHAR(100) NOT NULL,
    "name_te" VARCHAR(100) NOT NULL,
    "scope" "DocumentScope" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "document_types_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "category_document_types" (
    "category_id" UUID NOT NULL,
    "document_type_code" VARCHAR(40) NOT NULL,

    CONSTRAINT "category_document_types_pkey" PRIMARY KEY ("category_id","document_type_code")
);

-- CreateTable
CREATE TABLE "crops" (
    "id" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name_en" VARCHAR(100) NOT NULL,
    "name_te" VARCHAR(100) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "crops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ifsc_codes" (
    "ifsc" CHAR(11) NOT NULL,
    "bank" VARCHAR(120) NOT NULL,
    "branch" VARCHAR(160) NOT NULL,
    "district" VARCHAR(100),

    CONSTRAINT "ifsc_codes_pkey" PRIMARY KEY ("ifsc")
);

-- CreateTable
CREATE TABLE "app_settings" (
    "key" VARCHAR(60) NOT NULL,
    "value" JSONB NOT NULL,
    "updated_by_id" UUID,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "files" (
    "id" UUID NOT NULL,
    "bucket" "FileBucket" NOT NULL,
    "rel_path" VARCHAR(255) NOT NULL,
    "original_name" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "owner_user_id" UUID NOT NULL,
    "entity_type" VARCHAR(40),
    "entity_id" UUID,
    "attached_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "service_categories_code_key" ON "service_categories"("code");

-- CreateIndex
CREATE UNIQUE INDEX "operations_code_key" ON "operations"("code");

-- CreateIndex
CREATE INDEX "category_operations_operation_id_idx" ON "category_operations"("operation_id");

-- CreateIndex
CREATE INDEX "category_document_types_document_type_code_idx" ON "category_document_types"("document_type_code");

-- CreateIndex
CREATE UNIQUE INDEX "crops_code_key" ON "crops"("code");

-- CreateIndex
CREATE UNIQUE INDEX "files_rel_path_key" ON "files"("rel_path");

-- CreateIndex
CREATE INDEX "files_owner_user_id_attached_at_idx" ON "files"("owner_user_id", "attached_at");

-- CreateIndex
CREATE INDEX "files_entity_type_entity_id_idx" ON "files"("entity_type", "entity_id");

-- AddForeignKey
ALTER TABLE "category_operations" ADD CONSTRAINT "category_operations_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "service_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_operations" ADD CONSTRAINT "category_operations_operation_id_fkey" FOREIGN KEY ("operation_id") REFERENCES "operations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_document_types" ADD CONSTRAINT "category_document_types_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "service_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_document_types" ADD CONSTRAINT "category_document_types_document_type_code_fkey" FOREIGN KEY ("document_type_code") REFERENCES "document_types"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

