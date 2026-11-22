# REST API

Use base URL `http://localhost:5000/api/v1` in local development. Swagger UI is at `/api-docs/` and the OpenAPI document is at `/api-docs/openapi.json`.

| Method and path             | Authentication                 | Purpose                                                           |
| --------------------------- | ------------------------------ | ----------------------------------------------------------------- |
| GET /health                 | Public                         | API liveness                                                      |
| GET /health/ready           | Public                         | PostgreSQL connectivity, HTTP 503 when unavailable                |
| POST /auth/register         | CSRF header                    | Register a farmer or provider, record consent and start a session |
| POST /auth/login            | CSRF header                    | Password login and session creation                               |
| POST /auth/refresh          | Cookie and CSRF header         | Rotate the session and issue a new bearer token                   |
| POST /auth/logout           | Cookie and CSRF header         | Revoke the current session and clear its cookie                   |
| POST /auth/logout-all       | Bearer and CSRF header         | Revoke all sessions for the account                               |
| GET /auth/me                | Bearer                         | Current account, roles, permissions and per-role onboarding       |
| PATCH /auth/change-password | Bearer and CSRF header         | Verify current password, replace it and revoke all sessions       |
| GET /users/profile          | Bearer                         | Account details including assigned roles and verification flags   |
| PATCH /users/profile        | Bearer                         | Update display name, mobile, email or preferred language          |
| GET /portals/farmer         | Farmer role and permission     | Check farmer access                                               |
| GET /portals/provider       | Provider role and permission   | Check provider access                                             |
| GET /portals/admin          | Department role and permission | Check department access                                           |

Send the access token as `Authorization: Bearer <token>`. Include `X-CSRF-Protection: 1` on the covered session endpoints. Authenticated browsers receive a `mana_refresh` HttpOnly cookie scoped to `/api/v1/auth`. The frontend automatically rotates the cookie and fetches the user when restoring a session.

Success responses contain `success`, `message` and `data`. Error responses contain `success: false`, `message`, `code`, `errors` and `requestId`. A 422 lists known field errors. Duplicate registrations return 409. Invalid credentials use one generic 401 message. Triggering a rate limit returns 429 with `Retry-After` in seconds.
