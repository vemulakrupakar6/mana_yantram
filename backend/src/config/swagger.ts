import {
  object,
  ref,
  string,
  nullableString,
  uuid,
  language,
  username,
  password,
  providedPassword,
  consent,
  roles,
  auth,
  user,
  operation,
} from "./swagger-helpers.js";
import { milestone3Paths, milestone3Schemas, milestone3Tags } from "./swagger-m3.js";

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
      "Milestones 1 to 3. Session endpoints use a refresh cookie and an explicit CSRF header. Every write request needs the X-CSRF-Protection header.",
  },
  servers: [{ url: "/api/v1" }],
  tags: milestone3Tags,
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
      ...milestone3Schemas,
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
        summary: "Check PostgreSQL and file storage readiness",
        data: object({ status: string }),
        errors: { 503: "PostgreSQL or file storage is unavailable" },
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
    "/portals/operator": portal("operator"),
    "/portals/admin": portal("department"),
    ...milestone3Paths,
  },
};
