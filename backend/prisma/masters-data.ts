// Sample service masters (plan section 5.4). The department will extend these.
// Telugu names are best effort and listed in docs/telugu-review.md.
type Basis = "ACRE" | "HOUR" | "DAY";

export const documentTypes = [
  { code: "ID_PROOF", nameEn: "Identity proof", nameTe: "గుర్తింపు పత్రం", scope: "PROVIDER" },
  {
    code: "BANK_PROOF",
    nameEn: "Bank proof (cancelled cheque or passbook)",
    nameTe: "బ్యాంక్ రుజువు (రద్దు చేసిన చెక్ లేదా పాస్‌బుక్)",
    scope: "PROVIDER",
  },
  {
    code: "REGISTRATION_CERTIFICATE",
    nameEn: "Registration certificate (FPO/society)",
    nameTe: "రిజిస్ట్రేషన్ సర్టిఫికేట్",
    scope: "PROVIDER",
  },
  {
    code: "DRONE_PILOT_LICENCE",
    nameEn: "Drone pilot licence (RPC)",
    nameTe: "డ్రోన్ పైలట్ లైసెన్స్ (RPC)",
    scope: "PROVIDER",
  },
  {
    code: "MACHINE_RC",
    nameEn: "Machine registration certificate (RC)",
    nameTe: "యంత్ర రిజిస్ట్రేషన్ సర్టిఫికేట్ (RC)",
    scope: "EQUIPMENT",
  },
] as const;

export const operations: Array<{ code: string; nameEn: string; nameTe: string; basis: Basis }> = [
  { code: "PLOUGHING", nameEn: "Ploughing", nameTe: "దుక్కి దున్నడం", basis: "ACRE" },
  { code: "CULTIVATION", nameEn: "Cultivation", nameTe: "గుంటక", basis: "ACRE" },
  { code: "PUDDLING", nameEn: "Puddling", nameTe: "దమ్ము చేయడం", basis: "ACRE" },
  { code: "SOWING", nameEn: "Sowing", nameTe: "విత్తనం వేయడం", basis: "ACRE" },
  { code: "HAULAGE", nameEn: "Haulage", nameTe: "రవాణా", basis: "HOUR" },
  { code: "ROTAVATION", nameEn: "Rotavation", nameTe: "రోటవేషన్", basis: "ACRE" },
  { code: "SPRAYING", nameEn: "Spraying", nameTe: "పిచికారీ", basis: "ACRE" },
  { code: "HARVESTING", nameEn: "Harvesting", nameTe: "కోత", basis: "ACRE" },
];

export const categories = [
  {
    code: "TRACTOR",
    nameEn: "Tractor",
    nameTe: "ట్రాక్టర్",
    operations: ["PLOUGHING", "CULTIVATION", "PUDDLING", "SOWING", "HAULAGE"],
    documents: ["MACHINE_RC"],
    pilot: false,
  },
  {
    code: "ROTAVATOR",
    nameEn: "Rotavator",
    nameTe: "రోటవేటర్",
    operations: ["ROTAVATION"],
    documents: [],
    pilot: false,
  },
  {
    code: "DRONE",
    nameEn: "Drone",
    nameTe: "డ్రోన్",
    operations: ["SPRAYING"],
    documents: ["DRONE_PILOT_LICENCE"],
    pilot: true,
  },
  {
    code: "COMBINE_HARVESTER",
    nameEn: "Combine harvester",
    nameTe: "కంబైన్ హార్వెస్టర్",
    operations: ["HARVESTING"],
    documents: ["MACHINE_RC"],
    pilot: false,
  },
] as const;

export const crops = [
  ["PADDY", "Paddy", "వరి"],
  ["COTTON", "Cotton", "పత్తి"],
  ["MAIZE", "Maize", "మొక్కజొన్న"],
  ["RED_GRAM", "Red gram", "కంది"],
  ["BENGAL_GRAM", "Bengal gram", "శనగ"],
  ["GROUNDNUT", "Groundnut", "వేరుశనగ"],
  ["CHILLI", "Chilli", "మిరప"],
  ["SOYBEAN", "Soybean", "సోయాబీన్"],
  ["SUGARCANE", "Sugarcane", "చెరకు"],
  ["TURMERIC", "Turmeric", "పసుపు"],
] as const;
