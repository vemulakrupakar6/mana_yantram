import {
  failure,
  nullableString,
  object,
  operation,
  ref,
  string,
  success,
  uuid,
  username,
  language,
  type Operation,
} from "./swagger-helpers.js";

/** Milestone 3 endpoints: accounts, masters, files, farmers, providers, equipment, operators, verification. */
const integer = { type: "integer" };
const number = { type: "number" };
const bool = { type: "boolean" };
const anyObject = { type: "object", additionalProperties: true };
const list = (items: unknown) => ({ type: "array", items });
const loose = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});
const enumOf = (...values: string[]) => ({ ...string, enum: values });
const lat = { ...number, minimum: 6, maximum: 38 };
const lng = { ...number, minimum: 68, maximum: 98 };
const mobile = {
  ...string,
  pattern: "^[6-9][0-9]{9}$",
  description: "10-digit Indian mobile number",
};
const temporaryPassword = {
  ...string,
  minLength: 12,
  maxLength: 128,
  format: "password",
  writeOnly: true,
};
const remarks = (max = 500) => ({ ...string, minLength: 3, maxLength: max });
const notificationPrefs = loose({ sms: bool, inApp: bool, push: bool }, ["sms", "inApp", "push"]);
const crop = loose(
  { cropId: uuid, season: enumOf("KHARIF", "RABI", "SUMMER"), year: { ...integer, minimum: 2000 } },
  ["cropId", "season", "year"],
);
const providerFields = {
  type: enumOf("INDIVIDUAL", "FPO", "CHC", "AGENCY"),
  name: { ...string, minLength: 2, maxLength: 200 },
  contactPerson: { ...string, minLength: 2, maxLength: 150 },
  mobile,
  email: { ...string, format: "email" },
  addressLine: { ...string, minLength: 5, maxLength: 300 },
  pincode: { ...string, pattern: "^[1-9][0-9]{5}$" },
  districtId: uuid,
  mandalId: uuid,
  villageId: uuid,
  baseLatitude: lat,
  baseLongitude: lng,
  registrationNo: {
    ...string,
    minLength: 3,
    maxLength: 60,
    description: "Required unless the type is INDIVIDUAL",
  },
  gstin: { ...string, pattern: "^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$" },
};
const farmerFields = {
  fullName: { ...string, minLength: 2, maxLength: 150 },
  relationType: enumOf("FATHER", "HUSBAND"),
  relativeName: { ...string, minLength: 2, maxLength: 150 },
  gender: enumOf("MALE", "FEMALE", "OTHER"),
  mobile,
  districtId: uuid,
  mandalId: uuid,
  villageId: uuid,
  aadhaarNumber: {
    ...string,
    description:
      "12 digits with a valid Verhoeff checksum. Only the last 4 digits and a keyed hash are stored; the number is never returned.",
  },
  preferredLanguage: language,
  notifications: notificationPrefs,
};
const plotFields = {
  surveyNo: { ...string, minLength: 1, maxLength: 50 },
  extentAcres: { ...number, minimum: 0.01, maximum: 1000, description: "At most 2 decimals" },
  villageId: uuid,
  latitude: lat,
  longitude: lng,
  boundary: { ...anyObject, description: "Optional GeoJSON Polygon, closed, at most 200 points" },
  crops: { ...list(ref("PlotCrop")), maxItems: 10 },
};
const serviceFields = {
  operationId: uuid,
  pricingBasis: enumOf("ACRE", "HOUR", "DAY"),
  ratePaise: { ...integer, minimum: 100, description: "Integer paise (rupees x 100)" },
  minChargePaise: { ...integer, minimum: 0 },
  travelMode: enumOf("NONE", "FLAT", "PER_KM"),
  travelFlatPaise: { ...integer, minimum: 0, description: "Only with travelMode FLAT" },
  travelPerKmPaise: { ...integer, minimum: 1, description: "Only with travelMode PER_KM" },
  freeRadiusKm: { ...number, minimum: 0, description: "Only with travelMode PER_KM" },
  workRateAcresPerHour: { ...number, minimum: 0.1, maximum: 50 },
};
const reviewDecision = loose(
  {
    decision: enumOf("ACCEPT", "RETURN"),
    remarks: { ...remarks(), description: "Required when returning" },
  },
  ["decision"],
);
const fieldRemarks = {
  type: "object",
  description: "Optional remark per profile field, plus equipment remarks keyed by equipment id.",
  additionalProperties: false,
  properties: {
    ...Object.fromEntries(
      [
        "type",
        "name",
        "contactPerson",
        "mobile",
        "email",
        "addressLine",
        "pincode",
        "location",
        "baseLocation",
        "registrationNo",
        "gstin",
        "coverage",
        "workingHours",
      ].map((k) => [k, remarks()]),
    ),
    equipment: { type: "object", additionalProperties: remarks() },
  },
};

export const milestone3Schemas = {
  AddRole: object({ role: enumOf("FARMER", "PROVIDER") }),
  AdminUserCreate: loose(
    {
      username,
      displayName: { ...string, minLength: 2, maxLength: 150 },
      mobile,
      role: enumOf(
        "SUPER_ADMIN",
        "STATE_ADMIN",
        "DISTRICT_OFFICER",
        "MANDAL_OFFICER",
        "FIELD_AGENT",
        "HELPDESK",
      ),
      jurisdiction: loose(
        { level: enumOf("STATE", "DISTRICT", "MANDAL"), districtId: uuid, mandalId: uuid },
        ["level"],
      ),
      temporaryPassword,
    },
    ["username", "displayName", "role", "jurisdiction", "temporaryPassword"],
  ),
  Deactivate: object({ reason: { ...string, minLength: 5, maxLength: 300 } }),
  TemporaryPassword: object({ temporaryPassword }),
  Remarks: object({ remarks: remarks(1000) }),
  OptionalRemarks: loose({ remarks: remarks(1000) }),
  FarmerProfile: loose(farmerFields, [
    "fullName",
    "relationType",
    "relativeName",
    "gender",
    "mobile",
    "districtId",
    "mandalId",
    "villageId",
    "preferredLanguage",
    "notifications",
  ]),
  FarmerProfilePatch: {
    ...loose({ ...farmerFields, aadhaarNumber: { ...farmerFields.aadhaarNumber, nullable: true } }),
    minProperties: 1,
  },
  PlotCrop: crop,
  Plot: loose(plotFields, [
    "surveyNo",
    "extentAcres",
    "villageId",
    "latitude",
    "longitude",
    "crops",
  ]),
  PlotPatch: { ...loose(plotFields), minProperties: 1 },
  AssistedRegistration: loose(
    {
      account: object({ username, temporaryPassword }),
      profile: ref("FarmerProfile"),
      plots: { ...list(ref("Plot")), maxItems: 5 },
      consent: object({
        farmerConsented: { ...bool, enum: [true] },
        acceptTerms: { ...bool, enum: [true] },
        acceptPrivacyPolicy: { ...bool, enum: [true] },
      }),
    },
    ["account", "profile", "consent"],
  ),
  ProviderProfile: loose(providerFields, [
    "type",
    "name",
    "contactPerson",
    "mobile",
    "addressLine",
    "districtId",
    "mandalId",
    "villageId",
    "baseLatitude",
    "baseLongitude",
  ]),
  ProviderProfilePatch: {
    ...loose(
      Object.fromEntries(
        Object.entries(providerFields).map(([k, v]) => [
          k,
          ["email", "pincode", "registrationNo", "gstin"].includes(k)
            ? { ...v, nullable: true }
            : v,
        ]),
      ),
    ),
    minProperties: 1,
  },
  DocumentUpload: loose({ documentTypeCode: string, equipmentId: uuid, fileId: uuid }, [
    "documentTypeCode",
    "fileId",
  ]),
  BankAccount: object({
    holderName: { ...string, minLength: 2, maxLength: 150 },
    accountNumber: { ...string, pattern: "^[0-9]{9,18}$", writeOnly: true },
    confirmAccountNumber: { ...string, writeOnly: true },
    ifsc: { ...string, pattern: "^[A-Za-z]{4}0[A-Za-z0-9]{6}$" },
  }),
  Coverage: {
    oneOf: [
      object({ mode: enumOf("RADIUS"), radiusKm: { ...integer, minimum: 1, maximum: 100 } }),
      object({
        mode: enumOf("AREAS"),
        areas: {
          ...list({ oneOf: [object({ mandalId: uuid }), object({ villageId: uuid })] }),
          minItems: 1,
          maxItems: 200,
        },
      }),
    ],
  },
  WorkingHours: object({
    days: {
      ...list(
        object({
          weekday: { ...integer, minimum: 1, maximum: 7, description: "ISO weekday, 1 = Monday" },
          start: { ...string, example: "06:00" },
          end: { ...string, example: "18:00", description: "HH:MM, up to 24:00" },
        }),
      ),
      minItems: 1,
      maxItems: 7,
    },
  }),
  EquipmentCreate: loose(
    {
      categoryId: uuid,
      make: { ...string, maxLength: 80 },
      model: { ...string, maxLength: 80 },
      year: { ...integer, minimum: 1980 },
      capacityValue: number,
      capacityUnit: enumOf("HP", "LITRES", "FEET", "TONNES"),
      implements: { ...list(string), maxItems: 10 },
      numberOfUnits: { ...integer, minimum: 1, maximum: 50 },
      photoFileIds: { ...list(uuid), minItems: 1, maxItems: 5 },
    },
    ["categoryId", "make", "model", "year", "numberOfUnits", "photoFileIds"],
  ),
  EquipmentUpdate: {
    ...loose({
      categoryId: uuid,
      make: string,
      model: string,
      year: integer,
      capacityValue: { ...number, nullable: true },
      capacityUnit: { ...enumOf("HP", "LITRES", "FEET", "TONNES"), nullable: true },
      implements: list(string),
    }),
    minProperties: 1,
  },
  Photos: object({
    fileIds: {
      ...list(uuid),
      minItems: 1,
      maxItems: 5,
      description: "Ordered. Kept ids stay, new ids are attached, removed ids are soft-deleted.",
    },
  }),
  AddUnits: object({ count: { ...integer, minimum: 1, maximum: 20 } }),
  UnitUpdate: {
    ...loose({
      registrationNo: {
        ...string,
        pattern: "^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{1,4}$",
        nullable: true,
      },
      droneUin: {
        ...string,
        maxLength: 30,
        nullable: true,
        description: "Only for drone equipment",
      },
      status: enumOf("ACTIVE", "INACTIVE"),
    }),
    minProperties: 1,
  },
  Service: loose(serviceFields, [
    "operationId",
    "pricingBasis",
    "ratePaise",
    "workRateAcresPerHour",
  ]),
  ServicePatch: {
    ...loose(
      Object.fromEntries(Object.entries(serviceFields).filter(([k]) => k !== "operationId")),
    ),
    minProperties: 1,
  },
  AvailabilityBlock: object({
    startsAt: { ...string, format: "date-time" },
    endsAt: { ...string, format: "date-time" },
    reason: { ...string, minLength: 3, maxLength: 200 },
  }),
  OperatorCreate: loose(
    {
      fullName: { ...string, minLength: 2, maxLength: 150 },
      mobile,
      licenceNo: { ...string, minLength: 3, maxLength: 40 },
      licenceFileId: uuid,
      username,
      temporaryPassword,
      equipmentIds: list(uuid),
    },
    ["fullName", "mobile", "username", "temporaryPassword"],
  ),
  OperatorUpdate: {
    ...loose({
      fullName: string,
      mobile,
      licenceNo: nullableString,
      licenceFileId: { ...uuid, nullable: true },
    }),
    minProperties: 1,
  },
  OperatorEquipment: object({ equipmentIds: list(uuid) }),
  Review: reviewDecision,
  Verify: loose(
    {
      action: enumOf("APPROVE", "RETURN", "REJECT"),
      remarks: remarks(1000),
      fieldRemarks,
    },
    ["action"],
  ),
  FileUpload: object({
    purpose: enumOf("DOCUMENT", "EQUIPMENT_PHOTO"),
    file: { ...string, format: "binary" },
  }),
  RateCapEnabled: object({ enabled: bool }),
  RateCapCreate: loose(
    {
      categoryId: uuid,
      operationId: uuid,
      districtId: { ...uuid, description: "Omit for a statewide cap" },
      pricingBasis: enumOf("ACRE", "HOUR", "DAY"),
      maxRatePaise: { ...integer, minimum: 100, maximum: 100000000 },
    },
    ["categoryId", "operationId", "pricingBasis", "maxRatePaise"],
  ),
  RateCapUpdate: loose({
    maxRatePaise: { ...integer, minimum: 100, maximum: 100000000 },
    isActive: bool,
  }),
  FileInfo: object({
    id: uuid,
    url: string,
    originalName: string,
    mimeType: string,
    sizeBytes: integer,
    bucket: enumOf("DOCUMENT", "EQUIPMENT_PHOTO"),
  }),
};

export const milestone3Tags = [
  { name: "Accounts", description: "Roles and department user administration" },
  { name: "Masters", description: "Geography, service categories, document types, crops, IFSC" },
  {
    name: "Rate caps",
    description: "Optional maximum rates, switched on and managed by settings.manage holders",
  },
  {
    name: "Files",
    description: "Two-step uploads: POST /files, then submit the returned id in a form body",
  },
  { name: "Farmers", description: "Farmer profile and plots" },
  { name: "Assisted registration", description: "Field agents and helpdesk registering farmers" },
  {
    name: "Providers",
    description: "Provider application, documents, bank account, coverage and submission",
  },
  { name: "Equipment", description: "Equipment, units, photos and the rate card" },
  { name: "Operators", description: "Provider operators and the operator's own view" },
  { name: "Availability", description: "Per-unit blocked periods" },
  { name: "Verification", description: "Officer review, approval and sanctions" },
];

type Method = "get" | "post" | "put" | "patch" | "delete";
interface Row extends Partial<Omit<Operation, "tag" | "summary">> {
  tag: string;
  summary: string;
  /** Public endpoints skip authentication. */
  open?: boolean;
}
const common = {
  422: "Validation failed",
  403: "Not allowed (role, permission, origin or CSRF header)",
};
const notFound = { 404: "Not found, or outside your ownership or jurisdiction" };
const locked = { 409: "Not allowed in the provider's current status (INVALID_STATE)" };
const paramsOf = (path: string) => [...path.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);

const table: [Method, string, Row][] = [
  // accounts
  [
    "post",
    "/auth/roles",
    {
      tag: "Accounts",
      summary: "Add the other public role (farmer or provider) to your account",
      body: "AddRole",
      created: true,
      data: anyObject,
      errors: {
        403: "Department and operator accounts cannot add roles",
        409: "You already have that role",
      },
    },
  ],
  [
    "get",
    "/admin/users",
    {
      tag: "Accounts",
      summary: "List users in your jurisdiction",
      permission: "users.manage",
      query: ["search", "role", "status", "districtId", "page", "pageSize"],
    },
  ],
  [
    "post",
    "/admin/users",
    {
      tag: "Accounts",
      summary: "Create a department user with a temporary password",
      permission: "users.manage",
      body: "AdminUserCreate",
      created: true,
      errors: {
        403: "Role above your own level, or outside your jurisdiction",
        409: "Username or mobile already in use",
      },
    },
  ],
  [
    "get",
    "/admin/users/{id}",
    { tag: "Accounts", summary: "Get one user", permission: "users.manage" },
  ],
  [
    "post",
    "/admin/users/{id}/deactivate",
    {
      tag: "Accounts",
      summary: "Deactivate a user and revoke all of their sessions",
      permission: "users.manage",
      body: "Deactivate",
      errors: { 403: "Yourself, or an equal or higher rank", 409: "Already deactivated" },
    },
  ],
  [
    "post",
    "/admin/users/{id}/reactivate",
    { tag: "Accounts", summary: "Reactivate a user", permission: "users.manage" },
  ],
  [
    "post",
    "/admin/users/{id}/reset-password",
    {
      tag: "Accounts",
      summary: "Set a new temporary password (forces a change and revokes sessions)",
      permission: "users.manage",
      body: "TemporaryPassword",
    },
  ],
  // rate caps
  [
    "get",
    "/admin/settings/rate-caps-enabled",
    { tag: "Rate caps", summary: "Is rate cap enforcement on?", permission: "settings.manage" },
  ],
  [
    "put",
    "/admin/settings/rate-caps-enabled",
    {
      tag: "Rate caps",
      summary: "Switch rate cap enforcement on or off (audited)",
      permission: "settings.manage",
      body: "RateCapEnabled",
    },
  ],
  [
    "get",
    "/admin/rate-caps",
    {
      tag: "Rate caps",
      summary: "List rate caps",
      permission: "settings.manage",
      query: ["categoryId", "operationId", "districtId", "page", "pageSize"],
    },
  ],
  [
    "post",
    "/admin/rate-caps",
    {
      tag: "Rate caps",
      summary: "Create a district or statewide cap",
      permission: "settings.manage",
      body: "RateCapCreate",
      created: true,
      errors: { 409: "A cap already exists for that combination (CAP_EXISTS)" },
    },
  ],
  [
    "patch",
    "/admin/rate-caps/{id}",
    {
      tag: "Rate caps",
      summary: "Change a cap's maximum or activate or deactivate it",
      permission: "settings.manage",
      body: "RateCapUpdate",
      errors: notFound,
    },
  ],
  [
    "get",
    "/masters/rate-cap",
    {
      tag: "Rate caps",
      summary: "The cap that applies to your district, for the rate form (providers)",
      query: ["categoryId", "operationId", "pricingBasis"],
      errors: { 409: "Provider profile not created yet (PROFILE_REQUIRED)" },
    },
  ],
  // masters
  ["get", "/masters/districts", { tag: "Masters", summary: "List active districts", open: true }],
  [
    "get",
    "/masters/districts/{id}/mandals",
    { tag: "Masters", summary: "List a district's active mandals", open: true },
  ],
  [
    "get",
    "/masters/mandals/{id}/villages",
    { tag: "Masters", summary: "List a mandal's active villages", open: true },
  ],
  [
    "get",
    "/masters/categories",
    {
      tag: "Masters",
      summary: "Service categories with their operations and required document types",
      open: true,
    },
  ],
  [
    "get",
    "/masters/document-types",
    { tag: "Masters", summary: "Active document types", open: true },
  ],
  ["get", "/masters/crops", { tag: "Masters", summary: "Active crops", open: true }],
  [
    "get",
    "/masters/ifsc/{ifsc}",
    {
      tag: "Masters",
      summary: "Look up an IFSC in the optional directory",
      errors: { 404: "Unknown IFSC or directory not loaded", 429: "Rate limit exceeded" },
    },
  ],
  // files
  [
    "get",
    "/files/{id}",
    {
      tag: "Files",
      summary: "Download a file you own, or a provider file inside your jurisdiction",
      description:
        "Streams the bytes with nosniff and no-store headers. Officer reads are audited. Replaced files are visible to officers only.",
    },
  ],
  ["delete", "/files/{id}", { tag: "Files", summary: "Delete one of your own unattached uploads" }],
  // farmers
  [
    "post",
    "/farmers/me",
    {
      tag: "Farmers",
      summary: "Create the farmer profile",
      body: "FarmerProfile",
      created: true,
      errors: { 409: "PROFILE_EXISTS, MOBILE_TAKEN or AADHAAR_TAKEN" },
    },
  ],
  [
    "get",
    "/farmers/me",
    {
      tag: "Farmers",
      summary: "Get the farmer profile (Aadhaar masked)",
      errors: { 409: "PROFILE_REQUIRED" },
    },
  ],
  [
    "patch",
    "/farmers/me",
    {
      tag: "Farmers",
      summary: "Update the farmer profile",
      body: "FarmerProfilePatch",
      errors: { 409: "MOBILE_TAKEN or AADHAAR_TAKEN" },
    },
  ],
  ["get", "/farmers/me/plots", { tag: "Farmers", summary: "List active plots" }],
  [
    "post",
    "/farmers/me/plots",
    {
      tag: "Farmers",
      summary: "Add a plot (at most 50 active)",
      body: "Plot",
      created: true,
      errors: { 422: "Validation failed, or PLOT_LIMIT" },
    },
  ],
  ["get", "/farmers/me/plots/{plotId}", { tag: "Farmers", summary: "Get a plot" }],
  [
    "patch",
    "/farmers/me/plots/{plotId}",
    { tag: "Farmers", summary: "Update a plot; crops replaces the full set", body: "PlotPatch" },
  ],
  ["delete", "/farmers/me/plots/{plotId}", { tag: "Farmers", summary: "Soft-delete a plot" }],
  // assisted + officers
  [
    "post",
    "/assisted/farmers",
    {
      tag: "Assisted registration",
      summary: "Register a farmer on their behalf",
      permission: "farmer.register_assisted",
      body: "AssistedRegistration",
      created: true,
      errors: {
        403: "Outside your jurisdiction (OUT_OF_JURISDICTION)",
        409: "USERNAME_TAKEN, MOBILE_TAKEN or AADHAAR_TAKEN",
      },
    },
  ],
  [
    "get",
    "/assisted/farmers",
    {
      tag: "Assisted registration",
      summary: "Farmers you registered",
      permission: "farmer.register_assisted",
      query: ["search", "page", "pageSize"],
    },
  ],
  [
    "get",
    "/assisted/farmers/{id}",
    {
      tag: "Assisted registration",
      summary: "One farmer you registered, with plots",
      permission: "farmer.register_assisted",
    },
  ],
  [
    "post",
    "/assisted/farmers/{id}/plots",
    {
      tag: "Assisted registration",
      summary: "Add a plot for a farmer you registered",
      permission: "farmer.register_assisted",
      body: "Plot",
      created: true,
    },
  ],
  [
    "get",
    "/admin/farmers",
    {
      tag: "Farmers",
      summary:
        "Farmers in your jurisdiction (field agents see their own registrations; helpdesk sees masked mobiles)",
      permission: "farmer.view",
      query: ["districtId", "mandalId", "villageId", "search", "assisted", "page", "pageSize"],
    },
  ],
  [
    "get",
    "/admin/farmers/{id}",
    { tag: "Farmers", summary: "One farmer with plots", permission: "farmer.view" },
  ],
  // providers
  [
    "post",
    "/providers/me",
    {
      tag: "Providers",
      summary: "Create the provider application (status DRAFT)",
      body: "ProviderProfile",
      created: true,
      errors: { 409: "PROFILE_EXISTS" },
    },
  ],
  [
    "get",
    "/providers/me",
    {
      tag: "Providers",
      summary:
        "Get the application: status, latest return remarks, masked bank account, coverage, hours, counts",
      errors: { 409: "PROFILE_REQUIRED" },
    },
  ],
  [
    "patch",
    "/providers/me",
    {
      tag: "Providers",
      summary: "Update the profile (DRAFT or RETURNED)",
      body: "ProviderProfilePatch",
      errors: locked,
    },
  ],
  [
    "get",
    "/providers/me/documents",
    { tag: "Providers", summary: "Required documents merged with uploaded ones" },
  ],
  [
    "put",
    "/providers/me/documents",
    {
      tag: "Providers",
      summary:
        "Attach an uploaded file as a document (replaces the previous one and resets review)",
      body: "DocumentUpload",
      errors: { ...locked, 422: "Validation failed, or FILE_NOT_AVAILABLE" },
    },
  ],
  [
    "delete",
    "/providers/me/documents/{id}",
    { tag: "Providers", summary: "Remove a document", errors: locked },
  ],
  [
    "put",
    "/providers/me/bank-account",
    {
      tag: "Providers",
      summary: "Save the bank account (encrypted at rest, always returned masked)",
      body: "BankAccount",
      errors: locked,
    },
  ],
  [
    "put",
    "/providers/me/coverage",
    {
      tag: "Providers",
      summary: "Set the service coverage (radius or areas)",
      body: "Coverage",
      errors: locked,
    },
  ],
  [
    "put",
    "/providers/me/working-hours",
    {
      tag: "Providers",
      summary: "Replace the weekly working hours",
      body: "WorkingHours",
      errors: locked,
    },
  ],
  [
    "get",
    "/providers/me/checklist",
    {
      tag: "Providers",
      summary: "Submission checklist and whether the application can be submitted",
    },
  ],
  [
    "post",
    "/providers/me/submit",
    {
      tag: "Providers",
      summary: "Submit (or resubmit) for verification",
      errors: {
        409: "INVALID_STATE",
        422: "APPLICATION_INCOMPLETE, listing the undone checklist items",
      },
    },
  ],
  [
    "get",
    "/providers/me/verification-history",
    { tag: "Providers", summary: "Every status change, newest first; actors are shown as roles" },
  ],
  // equipment
  [
    "get",
    "/providers/me/equipment",
    {
      tag: "Equipment",
      summary: "List equipment with unit and service counts and the first photo",
    },
  ],
  [
    "post",
    "/providers/me/equipment",
    {
      tag: "Equipment",
      summary: "Create equipment with its units and 1 to 5 photos",
      body: "EquipmentCreate",
      created: true,
      errors: { ...locked, 422: "Validation failed, or FILE_NOT_AVAILABLE" },
    },
  ],
  [
    "get",
    "/providers/me/equipment/{id}",
    { tag: "Equipment", summary: "Equipment detail: photos, units and rate card" },
  ],
  [
    "patch",
    "/providers/me/equipment/{id}",
    {
      tag: "Equipment",
      summary: "Update equipment details",
      body: "EquipmentUpdate",
      errors: locked,
    },
  ],
  [
    "post",
    "/providers/me/equipment/{id}/activate",
    { tag: "Equipment", summary: "Activate equipment", errors: locked },
  ],
  [
    "post",
    "/providers/me/equipment/{id}/deactivate",
    { tag: "Equipment", summary: "Deactivate equipment (there is no hard delete)", errors: locked },
  ],
  [
    "put",
    "/providers/me/equipment/{id}/photos",
    { tag: "Equipment", summary: "Set the ordered photo list", body: "Photos", errors: locked },
  ],
  ["get", "/providers/me/equipment/{id}/units", { tag: "Equipment", summary: "List units" }],
  [
    "post",
    "/providers/me/equipment/{id}/units",
    {
      tag: "Equipment",
      summary: "Add units with the next labels (50 per equipment)",
      body: "AddUnits",
      created: true,
      errors: locked,
    },
  ],
  [
    "patch",
    "/providers/me/equipment/{id}/units/{unitId}",
    {
      tag: "Equipment",
      summary: "Set a unit's registration number, drone UIN or status",
      body: "UnitUpdate",
      errors: locked,
    },
  ],
  ["get", "/providers/me/equipment/{id}/services", { tag: "Equipment", summary: "The rate card" }],
  [
    "post",
    "/providers/me/equipment/{id}/services",
    {
      tag: "Equipment",
      summary: "Add a rate-card line (revives a removed one)",
      body: "Service",
      created: true,
      errors: {
        409: "SERVICE_EXISTS or INVALID_STATE",
        422: "Validation failed, or RATE_ABOVE_CAP when rate caps are enabled",
      },
    },
  ],
  [
    "patch",
    "/providers/me/equipment/{id}/services/{serviceId}",
    {
      tag: "Equipment",
      summary: "Update a rate-card line; unspecified fields keep their values",
      body: "ServicePatch",
      errors: { ...locked, 422: "Validation failed, or RATE_ABOVE_CAP" },
    },
  ],
  [
    "delete",
    "/providers/me/equipment/{id}/services/{serviceId}",
    { tag: "Equipment", summary: "Remove a rate-card line (soft delete)", errors: locked },
  ],
  // availability
  [
    "get",
    "/providers/me/availability",
    {
      tag: "Availability",
      summary: "Blocked periods for all units (at most 92 days)",
      query: ["from", "to"],
    },
  ],
  [
    "get",
    "/providers/me/units/{unitId}/blocks",
    { tag: "Availability", summary: "Blocked periods for one unit", query: ["from", "to"] },
  ],
  [
    "post",
    "/providers/me/units/{unitId}/blocks",
    {
      tag: "Availability",
      summary: "Block a period (at most 180 days)",
      body: "AvailabilityBlock",
      created: true,
      errors: { 409: "BLOCK_OVERLAP, or INVALID_STATE for rejected and blacklisted providers" },
    },
  ],
  [
    "delete",
    "/providers/me/units/{unitId}/blocks/{blockId}",
    { tag: "Availability", summary: "Remove a blocked period" },
  ],
  // operators
  ["get", "/providers/me/operators", { tag: "Operators", summary: "List your operators" }],
  [
    "post",
    "/providers/me/operators",
    {
      tag: "Operators",
      summary: "Create an operator with a temporary password",
      body: "OperatorCreate",
      created: true,
      errors: { 409: "USERNAME_TAKEN or MOBILE_TAKEN" },
    },
  ],
  ["get", "/providers/me/operators/{id}", { tag: "Operators", summary: "One operator" }],
  [
    "patch",
    "/providers/me/operators/{id}",
    { tag: "Operators", summary: "Update name, mobile or licence", body: "OperatorUpdate" },
  ],
  [
    "put",
    "/providers/me/operators/{id}/equipment",
    { tag: "Operators", summary: "Replace the assigned equipment", body: "OperatorEquipment" },
  ],
  [
    "post",
    "/providers/me/operators/{id}/deactivate",
    { tag: "Operators", summary: "Deactivate the operator and revoke their sessions" },
  ],
  [
    "post",
    "/providers/me/operators/{id}/activate",
    { tag: "Operators", summary: "Reactivate the operator" },
  ],
  [
    "post",
    "/providers/me/operators/{id}/reset-password",
    { tag: "Operators", summary: "Set a new temporary password", body: "TemporaryPassword" },
  ],
  [
    "get",
    "/operator/me",
    { tag: "Operators", summary: "The operator's own profile, employer and assigned equipment" },
  ],
  // verification
  [
    "get",
    "/admin/providers",
    {
      tag: "Verification",
      summary: "Review queue (SUBMITTED is oldest first) with pending-item counts",
      permission: "provider.view",
      query: [
        "status",
        "districtId",
        "mandalId",
        "type",
        "search",
        "submittedFrom",
        "submittedTo",
        "page",
        "pageSize",
      ],
    },
  ],
  [
    "get",
    "/admin/providers/{id}",
    {
      tag: "Verification",
      summary: "Full application detail with documents, equipment and history",
      permission: "provider.view",
    },
  ],
  [
    "post",
    "/admin/providers/{id}/documents/{docId}/review",
    {
      tag: "Verification",
      summary: "Accept or return one document",
      permission: "provider.verify",
      body: "Review",
      errors: { 409: "INVALID_STATE" },
    },
  ],
  [
    "post",
    "/admin/providers/{id}/bank-account/review",
    {
      tag: "Verification",
      summary: "Accept or return the bank account (SUBMITTED only)",
      permission: "provider.verify",
      body: "Review",
      errors: { 409: "INVALID_STATE" },
    },
  ],
  [
    "get",
    "/admin/providers/{id}/bank-account/reveal",
    {
      tag: "Verification",
      summary: "Reveal the full account number (audited)",
      permission: "provider.verify",
    },
  ],
  [
    "post",
    "/admin/providers/{id}/verify",
    {
      tag: "Verification",
      summary: "Approve, return or reject a SUBMITTED application",
      permission: "provider.verify",
      body: "Verify",
      errors: {
        409: "INVALID_STATE",
        422: "APPLICATION_INCOMPLETE for approval, or remarks missing",
      },
    },
  ],
  [
    "post",
    "/admin/providers/{id}/suspend",
    {
      tag: "Verification",
      summary: "Suspend an approved provider",
      permission: "provider.suspend",
      body: "Remarks",
      errors: { 409: "INVALID_STATE" },
    },
  ],
  [
    "post",
    "/admin/providers/{id}/blacklist",
    {
      tag: "Verification",
      summary: "Blacklist an approved or suspended provider (final)",
      permission: "provider.suspend",
      body: "Remarks",
      errors: { 409: "INVALID_STATE" },
    },
  ],
  [
    "post",
    "/admin/providers/{id}/reinstate",
    {
      tag: "Verification",
      summary: "Reinstate a suspended provider",
      permission: "provider.suspend",
      body: "OptionalRemarks",
      errors: { 409: "INVALID_STATE" },
    },
  ],
];

const paths: Record<string, Record<string, unknown>> = {};
for (const [method, path, { open, ...row }] of table) {
  paths[path] ??= {};
  paths[path][method] = operation({
    ...row,
    authenticated: !open,
    csrf: method !== "get",
    params: paramsOf(path),
    errors: {
      ...(open ? {} : method === "get" ? { 403: "Role or permission missing" } : common),
      ...(paramsOf(path).length ? notFound : {}),
      ...row.errors,
    } as Record<number, string>,
  });
}
// Uploads are multipart, not JSON, so this operation is written out.
paths["/files"] = {
  post: {
    tags: ["Files"],
    summary: "Upload a file (step 1 of 2)",
    description:
      "Multipart upload. The type is detected from the bytes, not the declared MIME type or extension. DOCUMENT accepts PDF, JPEG and PNG up to 5 MB; EQUIPMENT_PHOTO accepts JPEG, PNG and WebP up to 8 MB. The returned id is then submitted in a JSON body, which attaches the file. Unattached uploads are deleted after 24 hours.",
    security: [{ bearerAuth: [] }],
    parameters: [{ $ref: "#/components/parameters/CsrfProtection" }],
    requestBody: {
      required: true,
      content: { "multipart/form-data": { schema: ref("FileUpload") } },
    },
    responses: {
      201: success("File stored", ref("FileInfo")),
      401: failure("Authentication required"),
      413: failure("FILE_TOO_LARGE"),
      415: failure("FILE_TYPE_NOT_ALLOWED"),
      422: failure("Missing file or purpose"),
      429: failure("Upload rate limit exceeded"),
    },
  },
};
export const milestone3Paths = paths;
