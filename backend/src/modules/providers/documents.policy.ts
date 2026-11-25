import type { DocumentScope, ProviderType } from "@prisma/client";

export interface PolicyEquipment {
  id: string;
  categoryId: string;
  label: string;
}
export interface PolicyCategory {
  id: string;
  documentTypes: { code: string; scope: DocumentScope }[];
}
export interface RequiredDocument {
  documentTypeCode: string;
  scope: DocumentScope;
  equipmentId: string | null;
  equipmentLabel: string | null;
}

/**
 * Documents a provider must have on file (plan section 7.6.1):
 *  - always ID_PROOF and BANK_PROOF;
 *  - REGISTRATION_CERTIFICATE unless the provider is an individual;
 *  - for each category among ACTIVE equipment: provider-scope documents once,
 *    equipment-scope documents once per active equipment of that category.
 */
export function requiredDocuments(
  type: ProviderType,
  activeEquipment: PolicyEquipment[],
  categories: PolicyCategory[],
): RequiredDocument[] {
  const result: RequiredDocument[] = [
    { documentTypeCode: "ID_PROOF", scope: "PROVIDER", equipmentId: null, equipmentLabel: null },
    { documentTypeCode: "BANK_PROOF", scope: "PROVIDER", equipmentId: null, equipmentLabel: null },
  ];
  if (type !== "INDIVIDUAL")
    result.push({
      documentTypeCode: "REGISTRATION_CERTIFICATE",
      scope: "PROVIDER",
      equipmentId: null,
      equipmentLabel: null,
    });
  const seenProviderScope = new Set(result.map((r) => r.documentTypeCode));
  for (const category of categories) {
    const items = activeEquipment.filter((e) => e.categoryId === category.id);
    if (!items.length) continue;
    for (const doc of category.documentTypes) {
      if (doc.scope === "PROVIDER") {
        if (seenProviderScope.has(doc.code)) continue;
        seenProviderScope.add(doc.code);
        result.push({
          documentTypeCode: doc.code,
          scope: "PROVIDER",
          equipmentId: null,
          equipmentLabel: null,
        });
      } else {
        for (const item of items)
          result.push({
            documentTypeCode: doc.code,
            scope: "EQUIPMENT",
            equipmentId: item.id,
            equipmentLabel: item.label,
          });
      }
    }
  }
  return result;
}
export const documentKey = (code: string, equipmentId: string | null) =>
  code + "|" + (equipmentId ?? "");
