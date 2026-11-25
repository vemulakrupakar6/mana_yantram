import { roleNames } from "../modules/rbac/roles.js";

export const object = (
  properties: Record<string, unknown>,
  required = Object.keys(properties),
) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});
export const ref = (name: string) => ({ $ref: "#/components/schemas/" + name });
export const json = (schema: unknown) => ({ "application/json": { schema } });
export const string = { type: "string" };
export const nullableString = { ...string, nullable: true };
export const uuid = { ...string, format: "uuid" };
export const language = { ...string, enum: ["en", "te"] };
export const username = { ...string, minLength: 3, maxLength: 50, pattern: "^[A-Za-z0-9._-]+$" };
export const password = {
  ...string,
  minLength: 12,
  maxLength: 128,
  format: "password",
  writeOnly: true,
};
export const providedPassword = { ...password, minLength: 1 };
export const consent = { type: "boolean", enum: [true] };
export const roles = { type: "array", items: { ...string, enum: Object.keys(roleNames) } };
export const success = (description: string, data: unknown) => ({
  description,
  content: json(object({ success: { type: "boolean", enum: [true] }, message: string, data })),
});
export const failure = (description: string) => ({ description, content: json(ref("Error")) });
export const csrf = { $ref: "#/components/parameters/CsrfProtection" };

export type Operation = {
  tag: string;
  summary: string;
  data?: unknown;
  body?: string;
  authenticated?: boolean;
  csrf?: boolean;
  created?: boolean;
  errors?: Record<number, string>;
  description?: string;
  /** Path parameter names, e.g. ["id"] for /things/{id}. */
  params?: string[];
  /** Query parameter names. */
  query?: string[];
  /** Permission required, appended to the description. */
  permission?: string;
};
export function operation(options: Operation) {
  const parameters = [
    ...(options.csrf ? [csrf] : []),
    ...(options.params ?? []).map((name) => ({ name, in: "path", required: true, schema: uuid })),
    ...(options.query ?? []).map((name) => ({
      name,
      in: "query",
      required: false,
      schema: string,
    })),
  ];
  const description = [
    options.description,
    options.permission && "Requires permission `" + options.permission + "`.",
  ]
    .filter(Boolean)
    .join(" ");
  return {
    tags: [options.tag],
    summary: options.summary,
    description: description || undefined,
    ...(parameters.length && { parameters }),
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
export const auth = (options: Omit<Operation, "tag">) =>
  operation({ tag: "Authentication", ...options });
export const user = (options: Omit<Operation, "tag" | "authenticated">) =>
  operation({ tag: "Account", authenticated: true, ...options });
