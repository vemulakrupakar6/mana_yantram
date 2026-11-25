import { expect, test } from "vitest";
import { portalFor, safeReturn, userDestination } from "./access";
import type { AuthUser } from "@/types/auth";

const user = (overrides: Partial<AuthUser> = {}): AuthUser => ({
  id: "u",
  username: "u",
  displayName: null,
  roles: ["FARMER"],
  permissions: [],
  preferredLanguage: "en",
  onboarding: { FARMER: "COMPLETED" },
  mustChangePassword: false,
  jurisdiction: null,
  ...overrides,
});
test("operators get their own portal", () => {
  expect(portalFor("OPERATOR")).toBe("operator");
  expect(userDestination(user({ roles: ["OPERATOR"] }), "OPERATOR")).toBe("/operator/dashboard");
});
test("safeReturn allows the portal prefixes and rejects open redirects", () => {
  for (const ok of [
    "/farmer/plots/new?first=1",
    "/provider/equipment/abc",
    "/operator/dashboard",
    "/admin/users/123",
    "/profile",
    "/account/password",
    "/onboarding",
  ])
    expect(safeReturn(ok)).toBe(ok);
  for (const bad of [
    "//evil.com",
    "/\\evil.com",
    "/admin/\nx",
    "https://evil.com",
    "/farmerx/dashboard",
    "/login",
    "",
    42,
    null,
  ])
    expect(safeReturn(bad)).toBeNull();
});
test("a forced password change takes priority over every destination", () => {
  expect(userDestination(user({ mustChangePassword: true }), "FARMER", "/farmer/plots")).toBe(
    "/account/password",
  );
});
