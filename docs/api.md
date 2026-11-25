# REST API

Use base URL `http://localhost:5000/api/v1` in local development. Swagger UI is at `/api-docs/` and the OpenAPI document is at `/api-docs/openapi.json` (development only). A Postman collection and local environment are in `docs/postman/`. The tables below are generated from the OpenAPI document with `npx tsx scripts/api-table.ts` (run in `backend/`), and tests keep the OpenAPI document, the Postman collection and the real routes in step.

## Conventions

- **Authentication.** Send `Authorization: Bearer <access token>`. Access tokens last 15 minutes; a rotating refresh cookie (`mana_refresh`, HttpOnly, scoped to `/api/v1/auth`) renews them. Every account signs in with a username and password; there is no OTP.
- **CSRF.** Send `X-CSRF-Protection: 1` on every write request.
- **Temporary passwords.** Accounts created by someone else (department users, operators, assisted farmers) must change their password first: every other endpoint answers `403 PASSWORD_CHANGE_REQUIRED` until they do. Only `GET /auth/me`, `PATCH /auth/change-password` and the logout endpoints work meanwhile.
- **Envelope.** Success: `{ success, message, data }`. Failure: `{ success: false, message, code, errors[], requestId }`, where `errors` lists `{ field, message }` pairs for 409 and 422 responses.
- **Pagination.** Lists take `?page=1&pageSize=20` (maximum 100) and return `{ items, page, pageSize, total }`.
- **Ownership and jurisdiction.** A resource that is not yours, and not inside an officer's jurisdiction, answers `404 NOT_FOUND` (never 403), so identifiers cannot be probed. Writes that carry a location answer `403 OUT_OF_JURISDICTION` when it is outside the caller's area.
- **Money** is integer paise (rupees x 100). **Area** is acres with two decimals, returned as strings. **Location** is latitude 6 to 38 and longitude 68 to 98. **Working hours** are `HH:MM` (an end of `24:00` is allowed).
- **Uploads** are two steps: `POST /files` (multipart) returns an id, and a later JSON body submits that id, which attaches the file. Unattached uploads are removed after 24 hours.
- **Sensitive data.** Aadhaar numbers are never stored in full or returned (only the last four digits and a keyed hash). Bank account numbers are encrypted and returned masked; only `GET /admin/providers/{id}/bank-account/reveal` returns the number, and it is audited.

## Error codes

| Code                                                            | Status | Meaning                                                                           |
| --------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------- |
| `VALIDATION_ERROR`                                              | 422    | Invalid input; `errors[]` lists the fields                                        |
| `INVALID_CREDENTIALS`                                           | 401    | Wrong username or password (one generic message)                                  |
| `ACCOUNT_DEACTIVATED`                                           | 403    | Correct password, but the account is deactivated                                  |
| `PASSWORD_CHANGE_REQUIRED`                                      | 403    | A temporary password is still in force                                            |
| `ACCESS_DENIED`                                                 | 403    | Role or permission missing                                                        |
| `OUT_OF_JURISDICTION`                                           | 403    | The location is outside the caller's jurisdiction                                 |
| `ROLE_NOT_GRANTABLE`                                            | 403    | The role is above the caller's level, or the account type cannot add it           |
| `NOT_FOUND`                                                     | 404    | Missing, not yours, or outside your jurisdiction                                  |
| `USERNAME_TAKEN`, `MOBILE_TAKEN`, `AADHAAR_TAKEN`               | 409    | Uniqueness conflicts, reported on the offending field                             |
| `ROLE_EXISTS`, `PROFILE_EXISTS`, `SERVICE_EXISTS`, `CAP_EXISTS` | 409    | Already present                                                                   |
| `PROFILE_REQUIRED`                                              | 409    | The farmer or provider profile has not been created yet                           |
| `INVALID_STATE`                                                 | 409    | The action is not allowed in the provider's current status                        |
| `BLOCK_OVERLAP`                                                 | 409    | The blocked period overlaps another for that unit                                 |
| `APPLICATION_INCOMPLETE`                                        | 422    | Submit or approve before everything is in place; `errors[]` names what is missing |
| `FILE_NOT_AVAILABLE`                                            | 422    | The file is not yours, is already attached, or is in the wrong bucket             |
| `RATE_ABOVE_CAP`                                                | 422    | The rate exceeds the applicable cap (only while rate caps are enabled)            |
| `PLOT_LIMIT`, `UNIT_LIMIT`                                      | 422    | Per-farmer plot limit, per-equipment unit limit                                   |
| `FILE_TOO_LARGE`                                                | 413    | Over the size limit for the upload purpose                                        |
| `FILE_TYPE_NOT_ALLOWED`                                         | 415    | The file's real type (from its bytes) is not allowed                              |
| `RATE_LIMITED`                                                  | 429    | Too many attempts; see `Retry-After`                                              |
| `STORAGE_UNAVAILABLE`                                           | 503    | Readiness only: the file storage folder is missing or not writable                |

## Provider application status

`DRAFT` (provider edits, then **submit**) becomes `SUBMITTED` (locked while the department reviews). An officer then **approves** (`APPROVED`), **returns** with remarks (`RETURNED`, the provider fixes the flagged items and resubmits) or **rejects** (`REJECTED`, final). An approved provider can be **suspended** (`SUSPENDED`, then **reinstated**) or **blacklisted** (final, from approved or suspended). Edits are allowed as follows:

| Section                                                  | DRAFT / RETURNED | APPROVED / SUSPENDED | SUBMITTED | REJECTED / BLACKLISTED |
| -------------------------------------------------------- | ---------------- | -------------------- | --------- | ---------------------- |
| Profile, provider documents, bank account                | yes              | read-only            | locked    | locked                 |
| Equipment, units, photos, rate card, equipment documents | yes              | yes                  | locked    | locked                 |
| Coverage and working hours                               | yes              | yes                  | locked    | locked                 |
| Operators and availability blocks                        | yes              | yes                  | yes       | locked                 |

Approval needs every required document and the bank account accepted. Returning needs a remark, a field remark, or a returned item. Rejecting needs remarks. Only `provider.view` holders in the provider's jurisdiction can see an application; `provider.verify` allows review, approve, return, reject and the bank reveal; `provider.suspend` allows suspend, blacklist and reinstate.

## Endpoints

### Health

| Method and path   | Access | Purpose                                     |
| ----------------- | ------ | ------------------------------------------- |
| GET /health       | Public | Check liveness                              |
| GET /health/ready | Public | Check PostgreSQL and file storage readiness |

### Authentication

| Method and path             | Access                              | Purpose                                    |
| --------------------------- | ----------------------------------- | ------------------------------------------ |
| POST /auth/register         | CSRF header (cookie or credentials) | Register a farmer or provider              |
| POST /auth/login            | CSRF header (cookie or credentials) | Sign in                                    |
| POST /auth/refresh          | CSRF header (cookie or credentials) | Rotate a refresh token                     |
| POST /auth/logout           | CSRF header (cookie or credentials) | Revoke the session from the refresh cookie |
| POST /auth/logout-all       | Bearer and CSRF header              | Revoke all account sessions                |
| GET /auth/me                | Bearer                              | Get the current authenticated user         |
| PATCH /auth/change-password | Bearer and CSRF header              | Change password and revoke all sessions    |

### Account

| Method and path      | Access                 | Purpose                |
| -------------------- | ---------------------- | ---------------------- |
| GET /users/profile   | Bearer                 | Get profile details    |
| PATCH /users/profile | Bearer and CSRF header | Update profile details |

### Portals

| Method and path       | Access | Purpose                        |
| --------------------- | ------ | ------------------------------ |
| GET /portals/farmer   | Bearer | Check farmer portal access     |
| GET /portals/provider | Bearer | Check provider portal access   |
| GET /portals/operator | Bearer | Check operator portal access   |
| GET /portals/admin    | Bearer | Check department portal access |

### Accounts

| Method and path                       | Access                            | Purpose                                                             |
| ------------------------------------- | --------------------------------- | ------------------------------------------------------------------- |
| POST /auth/roles                      | Bearer and CSRF header            | Add the other public role (farmer or provider) to your account      |
| GET /admin/users                      | Bearer, permission `users.manage` | List users in your jurisdiction                                     |
| POST /admin/users                     | Bearer, permission `users.manage` | Create a department user with a temporary password                  |
| GET /admin/users/{id}                 | Bearer, permission `users.manage` | Get one user                                                        |
| POST /admin/users/{id}/deactivate     | Bearer, permission `users.manage` | Deactivate a user and revoke all of their sessions                  |
| POST /admin/users/{id}/reactivate     | Bearer, permission `users.manage` | Reactivate a user                                                   |
| POST /admin/users/{id}/reset-password | Bearer, permission `users.manage` | Set a new temporary password (forces a change and revokes sessions) |

### Rate caps

| Method and path                       | Access                               | Purpose                                                              |
| ------------------------------------- | ------------------------------------ | -------------------------------------------------------------------- |
| GET /admin/settings/rate-caps-enabled | Bearer, permission `settings.manage` | Is rate cap enforcement on?                                          |
| PUT /admin/settings/rate-caps-enabled | Bearer, permission `settings.manage` | Switch rate cap enforcement on or off (audited)                      |
| GET /admin/rate-caps                  | Bearer, permission `settings.manage` | List rate caps                                                       |
| POST /admin/rate-caps                 | Bearer, permission `settings.manage` | Create a district or statewide cap                                   |
| PATCH /admin/rate-caps/{id}           | Bearer, permission `settings.manage` | Change a cap's maximum or activate or deactivate it                  |
| GET /masters/rate-cap                 | Bearer                               | The cap that applies to your district, for the rate form (providers) |

### Masters

| Method and path                     | Access | Purpose                                                              |
| ----------------------------------- | ------ | -------------------------------------------------------------------- |
| GET /masters/districts              | Public | List active districts                                                |
| GET /masters/districts/{id}/mandals | Public | List a district's active mandals                                     |
| GET /masters/mandals/{id}/villages  | Public | List a mandal's active villages                                      |
| GET /masters/categories             | Public | Service categories with their operations and required document types |
| GET /masters/document-types         | Public | Active document types                                                |
| GET /masters/crops                  | Public | Active crops                                                         |
| GET /masters/ifsc/{ifsc}            | Bearer | Look up an IFSC in the optional directory                            |

### Files

| Method and path    | Access                 | Purpose                                                              |
| ------------------ | ---------------------- | -------------------------------------------------------------------- |
| GET /files/{id}    | Bearer                 | Download a file you own, or a provider file inside your jurisdiction |
| DELETE /files/{id} | Bearer and CSRF header | Delete one of your own unattached uploads                            |
| POST /files        | Bearer and CSRF header | Upload a file (step 1 of 2)                                          |

### Farmers

| Method and path                   | Access                           | Purpose                                                                                               |
| --------------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------- |
| POST /farmers/me                  | Bearer and CSRF header           | Create the farmer profile                                                                             |
| GET /farmers/me                   | Bearer                           | Get the farmer profile (Aadhaar masked)                                                               |
| PATCH /farmers/me                 | Bearer and CSRF header           | Update the farmer profile                                                                             |
| GET /farmers/me/plots             | Bearer                           | List active plots                                                                                     |
| POST /farmers/me/plots            | Bearer and CSRF header           | Add a plot (at most 50 active)                                                                        |
| GET /farmers/me/plots/{plotId}    | Bearer                           | Get a plot                                                                                            |
| PATCH /farmers/me/plots/{plotId}  | Bearer and CSRF header           | Update a plot; crops replaces the full set                                                            |
| DELETE /farmers/me/plots/{plotId} | Bearer and CSRF header           | Soft-delete a plot                                                                                    |
| GET /admin/farmers                | Bearer, permission `farmer.view` | Farmers in your jurisdiction (field agents see their own registrations; helpdesk sees masked mobiles) |
| GET /admin/farmers/{id}           | Bearer, permission `farmer.view` | One farmer with plots                                                                                 |

### Assisted registration

| Method and path                   | Access                                        | Purpose                                |
| --------------------------------- | --------------------------------------------- | -------------------------------------- |
| POST /assisted/farmers            | Bearer, permission `farmer.register_assisted` | Register a farmer on their behalf      |
| GET /assisted/farmers             | Bearer, permission `farmer.register_assisted` | Farmers you registered                 |
| GET /assisted/farmers/{id}        | Bearer, permission `farmer.register_assisted` | One farmer you registered, with plots  |
| POST /assisted/farmers/{id}/plots | Bearer, permission `farmer.register_assisted` | Add a plot for a farmer you registered |

### Providers

| Method and path                        | Access                 | Purpose                                                                                          |
| -------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------ |
| POST /providers/me                     | Bearer and CSRF header | Create the provider application (status DRAFT)                                                   |
| GET /providers/me                      | Bearer                 | Get the application: status, latest return remarks, masked bank account, coverage, hours, counts |
| PATCH /providers/me                    | Bearer and CSRF header | Update the profile (DRAFT or RETURNED)                                                           |
| GET /providers/me/documents            | Bearer                 | Required documents merged with uploaded ones                                                     |
| PUT /providers/me/documents            | Bearer and CSRF header | Attach an uploaded file as a document (replaces the previous one and resets review)              |
| DELETE /providers/me/documents/{id}    | Bearer and CSRF header | Remove a document                                                                                |
| PUT /providers/me/bank-account         | Bearer and CSRF header | Save the bank account (encrypted at rest, always returned masked)                                |
| PUT /providers/me/coverage             | Bearer and CSRF header | Set the service coverage (radius or areas)                                                       |
| PUT /providers/me/working-hours        | Bearer and CSRF header | Replace the weekly working hours                                                                 |
| GET /providers/me/checklist            | Bearer                 | Submission checklist and whether the application can be submitted                                |
| POST /providers/me/submit              | Bearer and CSRF header | Submit (or resubmit) for verification                                                            |
| GET /providers/me/verification-history | Bearer                 | Every status change, newest first; actors are shown as roles                                     |

### Equipment

| Method and path                                          | Access                 | Purpose                                                         |
| -------------------------------------------------------- | ---------------------- | --------------------------------------------------------------- |
| GET /providers/me/equipment                              | Bearer                 | List equipment with unit and service counts and the first photo |
| POST /providers/me/equipment                             | Bearer and CSRF header | Create equipment with its units and 1 to 5 photos               |
| GET /providers/me/equipment/{id}                         | Bearer                 | Equipment detail: photos, units and rate card                   |
| PATCH /providers/me/equipment/{id}                       | Bearer and CSRF header | Update equipment details                                        |
| POST /providers/me/equipment/{id}/activate               | Bearer and CSRF header | Activate equipment                                              |
| POST /providers/me/equipment/{id}/deactivate             | Bearer and CSRF header | Deactivate equipment (there is no hard delete)                  |
| PUT /providers/me/equipment/{id}/photos                  | Bearer and CSRF header | Set the ordered photo list                                      |
| GET /providers/me/equipment/{id}/units                   | Bearer                 | List units                                                      |
| POST /providers/me/equipment/{id}/units                  | Bearer and CSRF header | Add units with the next labels (50 per equipment)               |
| PATCH /providers/me/equipment/{id}/units/{unitId}        | Bearer and CSRF header | Set a unit's registration number, drone UIN or status           |
| GET /providers/me/equipment/{id}/services                | Bearer                 | The rate card                                                   |
| POST /providers/me/equipment/{id}/services               | Bearer and CSRF header | Add a rate-card line (revives a removed one)                    |
| PATCH /providers/me/equipment/{id}/services/{serviceId}  | Bearer and CSRF header | Update a rate-card line; unspecified fields keep their values   |
| DELETE /providers/me/equipment/{id}/services/{serviceId} | Bearer and CSRF header | Remove a rate-card line (soft delete)                           |

### Availability

| Method and path                                      | Access                 | Purpose                                         |
| ---------------------------------------------------- | ---------------------- | ----------------------------------------------- |
| GET /providers/me/availability                       | Bearer                 | Blocked periods for all units (at most 92 days) |
| GET /providers/me/units/{unitId}/blocks              | Bearer                 | Blocked periods for one unit                    |
| POST /providers/me/units/{unitId}/blocks             | Bearer and CSRF header | Block a period (at most 180 days)               |
| DELETE /providers/me/units/{unitId}/blocks/{blockId} | Bearer and CSRF header | Remove a blocked period                         |

### Operators

| Method and path                                  | Access                 | Purpose                                                     |
| ------------------------------------------------ | ---------------------- | ----------------------------------------------------------- |
| GET /providers/me/operators                      | Bearer                 | List your operators                                         |
| POST /providers/me/operators                     | Bearer and CSRF header | Create an operator with a temporary password                |
| GET /providers/me/operators/{id}                 | Bearer                 | One operator                                                |
| PATCH /providers/me/operators/{id}               | Bearer and CSRF header | Update name, mobile or licence                              |
| PUT /providers/me/operators/{id}/equipment       | Bearer and CSRF header | Replace the assigned equipment                              |
| POST /providers/me/operators/{id}/deactivate     | Bearer and CSRF header | Deactivate the operator and revoke their sessions           |
| POST /providers/me/operators/{id}/activate       | Bearer and CSRF header | Reactivate the operator                                     |
| POST /providers/me/operators/{id}/reset-password | Bearer and CSRF header | Set a new temporary password                                |
| GET /operator/me                                 | Bearer                 | The operator's own profile, employer and assigned equipment |

### Verification

| Method and path                                     | Access                                | Purpose                                                           |
| --------------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------- |
| GET /admin/providers                                | Bearer, permission `provider.view`    | Review queue (SUBMITTED is oldest first) with pending-item counts |
| GET /admin/providers/{id}                           | Bearer, permission `provider.view`    | Full application detail with documents, equipment and history     |
| POST /admin/providers/{id}/documents/{docId}/review | Bearer, permission `provider.verify`  | Accept or return one document                                     |
| POST /admin/providers/{id}/bank-account/review      | Bearer, permission `provider.verify`  | Accept or return the bank account (SUBMITTED only)                |
| GET /admin/providers/{id}/bank-account/reveal       | Bearer, permission `provider.verify`  | Reveal the full account number (audited)                          |
| POST /admin/providers/{id}/verify                   | Bearer, permission `provider.verify`  | Approve, return or reject a SUBMITTED application                 |
| POST /admin/providers/{id}/suspend                  | Bearer, permission `provider.suspend` | Suspend an approved provider                                      |
| POST /admin/providers/{id}/blacklist                | Bearer, permission `provider.suspend` | Blacklist an approved or suspended provider (final)               |
| POST /admin/providers/{id}/reinstate                | Bearer, permission `provider.suspend` | Reinstate a suspended provider                                    |
