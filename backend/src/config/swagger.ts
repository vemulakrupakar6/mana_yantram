import { roleNames } from "../modules/rbac/roles.js";

const object = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});
const ref = (name: string) => ({ $ref: "#/components/schemas/" + name });
const json = (schema: unknown) => ({ "application/json": { schema } });
const string = { type: "string" };
const nullableString = { ...string, nullable: true };
const uuid = { ...string, format: "uuid" };
const language = { ...string, enum: ["en", "te"] };
const username = { ...string, minLength: 3, maxLength: 50, pattern: "^[A-Za-z0-9._-]+$" };
const password = { ...string, minLength: 12, maxLength: 128, format: "password", writeOnly: true };
const providedPassword = { ...password, minLength: 1 };
const consent = { type: "boolean", enum: [true] };
const roles = { type: "array", items: { ...string, enum: Object.keys(roleNames) } };
const success = (description: string, data: unknown) => ({
  description,
  content: json(object({ success: { type: "boolean", enum: [true] }, message: string, data })),
});
const failure = (description: string) => ({ description, content: json(ref("Error")) });
const csrf = { $ref: "#/components/parameters/CsrfProtection" };

type Operation = {
  tag: string;
  summary: string;
  data?: unknown;
  body?: string;
  authenticated?: boolean;
  csrf?: boolean;
  created?: boolean;
  errors?: Record<number, string>;
  description?: string;
};
function operation(options: Operation) {
  return {
    tags: [options.tag],
    summary: options.summary,
    description: options.description,
    ...(options.csrf && { parameters: [csrf] }),
    ...(options.authenticated && { security: [{ bearerAuth: [] }] }),
    ...(options.body && { requestBody: { required: true, content: json(ref(options.body)) } }),
    responses: {
      [options.created ? 201 : 200]: success(options.summary, options.data ?? object({})),
      ...Object.fromEntries(
        Object.entries({
          ...(options.authenticated ? { 401: "Authentication required or session invalid" } : {}),
          ...options.errors,
        }).map(([status, description]) => [status, failure(description)]),
      ),
    },
  };
}
const auth = (options: Omit<Operation, "tag">) => operation({ tag: "Authentication", ...options });
const user = (options: Omit<Operation, "tag" | "authenticated">) =>
  operation({ tag: "Account", authenticated: true, ...options });
const portal = (name: string) => ({
  get: operation({
    tag: "Portals",
    summary: "Check " + name + " portal access",
    authenticated: true,
    data: object({ roles }),
    errors: { 403: "Required permission is missing" },
  }),
});
const credentialErrors = {
  401: "Invalid username or password",
  403: "Origin or CSRF header rejected",
  422: "Validation failed",
  429: "Rate limit exceeded",
};

export const openApi = {
  openapi: "3.0.3",
  info: {
    title: "Mana Yantram API",
    version: "1.0.0",
    description:
      "Milestones 1 and 2. Session endpoints use a refresh cookie and an explicit CSRF header.",
  },
  servers: [{ url: "/api/v1" }],
  components: {
    securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" } },
    parameters: {
      CsrfProtection: {
        in: "header",
        name: "X-CSRF-Protection",
        required: true,
        schema: { ...string, enum: ["1"], default: "1" },
      },
    },
    schemas: {
      Error: object({
        success: { type: "boolean", enum: [false] },
        message: string,
        code: string,
        requestId: uuid,
        errors: { type: "array", items: object({ field: string, message: string }) },
      }),
      Registration: object({
        username,
        password,
        confirmPassword: password,
        role: { ...string, enum: ["FARMER", "PROVIDER"] },
        preferredLanguage: language,
        acceptTerms: consent,
        acceptPrivacyPolicy: consent,
      }),
      Login: object({ username, password: providedPassword }),
      PasswordChange: object({
        currentPassword: providedPassword,
        newPassword: password,
        confirmPassword: password,
      }),
      User: object({
        id: uuid,
        username,
        displayName: nullableString,
        roles,
        preferredLanguage: language,
        permissions: { type: "array", items: string },
        onboarding: {
          type: "object",
          additionalProperties: { ...string, enum: ["NOT_STARTED", "IN_PROGRESS", "COMPLETED"] },
        },
      }),
      Session: object({ user: ref("User"), accessToken: string }),
      Profile: object({
        id: uuid,
        username,
        roles,
        displayName: nullableString,
        mobile: nullableString,
        email: nullableString,
        preferredLanguage: language,
        mobileVerified: { type: "boolean" },
        emailVerified: { type: "boolean" },
        createdAt: { ...string, format: "date-time" },
      }),
      ProfileUpdate: {
        ...object(
          {
            displayName: { ...nullableString, maxLength: 150 },
            mobile: { ...nullableString, maxLength: 20 },
            email: { ...nullableString, format: "email", maxLength: 254 },
            preferredLanguage: language,
          },
          [],
        ),
        minProperties: 1,
      },
    },
  },
  paths: {
    "/health": {
      get: operation({
        tag: "Health",
        summary: "Check liveness",
        data: object({ status: string }),
      }),
    },
    "/health/ready": {
      get: operation({
        tag: "Health",
        summary: "Check PostgreSQL readiness",
        data: object({ status: string }),
        errors: { 503: "PostgreSQL is unavailable" },
      }),
    },
    "/auth/register": {
      post: auth({
        summary: "Register a farmer or provider",
        csrf: true,
        created: true,
        body: "Registration",
        data: ref("Session"),
        description: "Starts a session and sets the HttpOnly refresh cookie.",
        errors: {
          403: "Origin or CSRF header rejected",
          409: "Username is taken",
          422: "Validation failed",
          429: "Rate limit exceeded",
          503: "Registration role is unavailable",
        },
      }),
    },
    "/auth/login": {
      post: auth({
        summary: "Sign in",
        csrf: true,
        body: "Login",
        data: ref("Session"),
        errors: credentialErrors,
      }),
    },
    "/auth/refresh": {
      post: auth({
        summary: "Rotate a refresh token",
        csrf: true,
        data: ref("Session"),
        description: "Send the current HttpOnly cookie. Reuse revokes its token family.",
        errors: {
          401: "Refresh token invalid, expired, revoked or reused",
          403: "Origin or CSRF header rejected",
          429: "Rate limit exceeded",
        },
      }),
    },
    "/auth/logout": {
      post: auth({
        summary: "Revoke the session from the refresh cookie",
        csrf: true,
        errors: { 403: "Origin or CSRF header rejected" },
      }),
    },
    "/auth/logout-all": {
      post: auth({
        summary: "Revoke all account sessions",
        csrf: true,
        authenticated: true,
        errors: { 403: "Origin or CSRF header rejected" },
      }),
    },
    "/auth/me": {
      get: auth({
        summary: "Get the current authenticated user",
        authenticated: true,
        data: ref("User"),
      }),
    },
    "/auth/change-password": {
      patch: auth({
        summary: "Change password and revoke all sessions",
        csrf: true,
        authenticated: true,
        body: "PasswordChange",
        errors: {
          400: "Current password is incorrect",
          403: "Origin or CSRF header rejected",
          422: "Validation failed",
          429: "Rate limit exceeded",
        },
      }),
    },
    "/users/profile": {
      get: user({ summary: "Get profile details", data: ref("Profile") }),
      patch: user({
        summary: "Update profile details",
        data: ref("Profile"),
        body: "ProfileUpdate",
        errors: { 422: "Validation failed" },
      }),
    },
    "/portals/farmer": portal("farmer"),
    "/portals/provider": portal("provider"),
    "/portals/admin": portal("department"),
  },
};
