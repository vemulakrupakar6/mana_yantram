# Implementation status

## Milestone 1

- Initialized the Git repository and npm workspaces with independently runnable React/Vite and Express apps, strict TypeScript, ESLint and Prettier.
- Implemented an Express application with JSON and URL-encoded body limits, validated configuration, Helmet, explicit CORS, request IDs, Pino logging, consistent errors and graceful shutdown.
- Connected PostgreSQL and added liveness, database readiness and development Swagger.
- Built English and Telugu public pages, authentication layouts and reusable navigation, input, notification, loading, empty and error components using the supplied design system. The four service categories use illustrative agricultural photography.

## Milestone 2

- Implemented farmer and provider registration with normalized usernames, Argon2id hashing, transactional role assignment, per-role onboarding and policy consent.
- Implemented password login, refresh rotation and family reuse detection, current-session and all-device logout, password changes, origin and CSRF checks, PostgreSQL rate limiting and audit events.
- Added backend role and permission enforcement, browser route guards, safe return destinations, authorized role selection and initial farmer, provider and department dashboards.
- Connected the generic account page to profile APIs. Contact and language fields can be edited. Role membership, status and verification flags are assigned server-side.
- Seeded the nine supported roles and the three initial portal permissions. Optional demo accounts require explicit credentials.

## Created files

| Area          | Entry points and supporting files                                                                                                                                                                  |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workspace     | `package.json`, `package-lock.json`, `eslint.config.mjs`, `.prettierrc`, `.gitignore`, `docker-compose.yml`, `README.md`                                                                           |
| Backend       | `backend/.env.example`, `backend/src/app.ts`, `backend/src/server.ts`, configuration, shared middleware and the `health`, `auth`, `users` and `rbac` modules                                       |
| Database      | `backend/prisma.config.ts`, `backend/prisma/schema.prisma`, `backend/prisma/seed.ts`, `backend/prisma/migrations/202611220001_auth_foundation/migration.sql`                                       |
| Frontend      | `frontend/.env.example`, `frontend/vite.config.ts`, `frontend/components.json`, `frontend/src/App.tsx`, `frontend/src/main.tsx`, styles, layouts, pages, locale JSON files, API clients and stores |
| Tests         | `backend/src/modules/auth/auth.test.ts`, `backend/tests/setup.ts`, frontend component and Axios tests, `frontend/e2e/auth.spec.ts`                                                                 |
| Documentation | `docs/architecture.md`, `docs/api.md`, `docs/implementation-status.md` and the Postman collection and environment under `docs/postman/`                                                            |

## API endpoints

| Area           | Routes under `/api/v1`                                                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Health         | `GET /health`, `GET /health/ready`                                                                                                                           |
| Authentication | `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `POST /auth/logout-all`, `GET /auth/me`, `PATCH /auth/change-password` |
| Account        | `GET /users/profile`, `PATCH /users/profile`                                                                                                                 |
| Portals        | `GET /portals/farmer`, `GET /portals/provider`, `GET /portals/admin`                                                                                         |

Swagger UI and its OpenAPI document are available in development at `/api-docs/` and `/api-docs/openapi.json`.

## Frontend routes

| Access         | Routes                                                                    |
| -------------- | ------------------------------------------------------------------------- |
| Public         | `/`, `/about`, `/services`, `/help`, `/terms`, `/privacy`, `/403`, `/404` |
| Signed out     | `/login`, `/register`, `/register/account`                                |
| Signed in      | `/onboarding`, `/select-role`, `/profile`, `/account/password`            |
| Role protected | `/farmer/dashboard`, `/provider/dashboard`, `/admin/dashboard`            |

## Database and local startup

The Prisma migration creates `users`, `roles`, `permissions`, `user_roles`, `role_permissions`, `user_role_onboarding`, `refresh_tokens`, `consents`, `audit_logs` and `auth_rate_limits`. It was applied to the isolated development database and the dedicated test database. Role and permission seeding was rerun successfully.

This checkout uses a separate PostgreSQL 18 cluster bound to `127.0.0.1:55432`. The two databases are `mana_yantram` and `mana_yantram_test`. Connection configuration and generated development secrets live in ignored environment files. The local frontend enables dashboard previews. The example environment defaults to preview off.

Run `npm run dev` from the repository root to start the frontend on port 5173 and the API on port 5000. The [README](../README.md) covers fresh installation, migrations, seeds and test commands.

## Verification results

| Check                              | Result                                                                                                                                                                                                                             |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Root development command           | Frontend HTTP 200, API liveness HTTP 200 and PostgreSQL readiness HTTP 200                                                                                                                                                         |
| Builds, TypeScript and ESLint      | Passed for both workspaces                                                                                                                                                                                                         |
| Backend integration                | 42 passed against the dedicated PostgreSQL database                                                                                                                                                                                |
| Frontend component and Axios tests | 10 passed                                                                                                                                                                                                                          |
| Playwright smoke tests in Edge     | 3 passed, covering real farmer and provider registration, login, cookie restoration, expired access-token refresh, account edits, password changes, logout, unauthorized access, language switching and mobile keyboard navigation |
| Browser verification               | Seven public and authentication routes checked at 360, 768 and 1440 pixels. Swagger rendered 14 operations.                                                                                                                        |
| Postman                            | Each of the 14 documented API operations has a matching collection request.                                                                                                                                                        |
| Package audit                      | Zero reported vulnerabilities                                                                                                                                                                                                      |

## Known limitations and pending work

- Password-only authentication targets local development and restricted demonstrations. The terms and privacy notice use demo copy and version `demo-1.0`.
- `OPERATOR` exists as an assigned role. Its dedicated workspace will be introduced with operator workflows.
- Milestone 3 covers geographic masters, farmer and provider business profiles, detailed onboarding and department master-data management.
- The portal metrics are initial zero states. Live bookings, equipment, verification, payments, reporting and related operations belong to later milestones.
- Cookie rotation coordinates tabs through Web Locks where available. Simultaneous reuse without Web Locks can require a fresh sign-in.

## Milestone 3 (Phases 1 to 9 complete)

### Phase 1: foundations and existing-code fixes: complete

- Migration `202611240001_accounts_rbac_jurisdiction`: unique 10-digit `users.mobile` (existing values normalised first), `must_change_password`, deactivation columns, consent `purposes` and `captured_by_id`, `user_jurisdictions` (with level CHECK) and the geography tables.
- Fixes F1–F10, F14–F18: mobile rules and `MOBILE_TAKEN`, generic audit signature, explicit `rolePermissions` matrix synced by the seed, `ACCOUNT_DEACTIVATED`, forced password change (`PASSWORD_CHANGE_REQUIRED`), jurisdiction in the user summary, storage readiness check, consent purposes, operator portal, route-prefix return allowlist, permission-filtered sidebar, login hint.
- New: `POST /auth/roles`, admin users (list, get, create, deactivate, reactivate, reset password), `admin:create` bootstrap CLI, geography import and public geography endpoints, Verhoeff/Aadhaar/field-encryption utilities.
- Frontend: operator portal shell, `PermissionGuard`, forced-change redirect, add-role card, admin user pages, `GeoSelect`, `DataTable`/`Pagination`, locale key-parity test.
- Not yet done in Phase 1: F11 and F12 (provider dashboard status and the onboarding forms) depend on the Phase 3 and Phase 4 modules and will be done with them. Admin user scoping for farmer/provider/operator accounts also arrives with those tables; until then a district officer sees only users with a jurisdiction in their district.
- Verification: `npm run typecheck`, `npm run lint` and `npm test` pass (backend 69 tests, frontend 17).

### Phase 2: masters and files: complete

- Migration `202611240002_masters_files`: service categories, operations and their mappings, document types and per-category requirements, crops, IFSC codes, app settings and the `files` table. The seed loads the sample masters and `rateCapsEnabled = false` (never overwritten on re-seed).
- Masters API: districts, mandals, villages, categories (with operations, required document types and pilot-licence flag), document types, crops and an authenticated, rate-limited IFSC lookup. `assertLocationHierarchy` returns 422 with per-field errors. `npm run db:import-ifsc` is the optional IFSC import.
- Files API: `POST /files` (multipart; real type from the bytes, per-purpose size limits, UUID names under `STORAGE_ROOT`), `GET /files/:id` (owner policy, `nosniff`, `no-store`), `DELETE /files/:id` (own, unattached only), `attachFile`/`detachAndDelete` helpers and an hourly cleanup of unattached files older than 24 hours.
- Frontend: `FileUploadField`, `MultiPhotoField`, `useFileObjectUrl`, `openFile`, `LocationField`, `MoneyField`.
- Pending: the provider and officer branches of the file download policy need the provider tables (Phase 4); until then only the owner can read a file.

### Phase 3: farmer registration: complete

- Migration `202611240003_farmers`: farmers, plots and plot crops, with CHECK constraints for plot extent, the Aadhaar last-4/hash pair and crop year.
- Farmer self-service API: profile create/read/update (mobile and language on the account, Aadhaar stored only as last 4 digits plus a keyed hash, duplicate Aadhaar and mobile reported on the field, onboarding marked complete) and plot create/read/update/soft-delete (50 active plots, crops replaced as a set, optional GeoJSON boundary).
- Assisted registration API (`farmer.register_assisted`): one transaction creates the account (temporary password, forced change), FARMER role, consents recorded with `captured_by_id` and purposes, farmer with `registered_by_user_id`, and optional plots. Agents see only their own registrations.
- Officer API (`farmer.view`): list and detail scoped by jurisdiction; field agents see only farmers they registered; helpdesk sees a masked mobile.
- Frontend: onboarding form, profile page, plots pages, dashboard summary, assisted registration (form, list, detail, add plot, one-time credentials with print) and admin farmer list/detail.
- Fixed while testing: unique-constraint errors from the Prisma pg adapter carry the constraint name in `meta.driverAdapterError`, not `meta.target`. A shared `uniqueConstraint()` helper now drives `MOBILE_TAKEN` / `AADHAAR_TAKEN` / `USERNAME_TAKEN`, including the Phase 1 admin-users create endpoint (a duplicate mobile there was reported as `USERNAME_TAKEN`).
- Deviation from the plan: the assisted form does not embed a first plot. After registration the agent is offered "Add plot", which uses `POST /assisted/farmers/:id/plots`.
- Verification: backend 100 tests, frontend 29.

### Phase 4: provider profile, documents and bank details: complete

- Migration `202611240004_providers` creates the whole provider/equipment/operator table set in one go (providers, documents, bank accounts, coverage, working hours, verification history, equipment, photos, units, services, rate caps, availability blocks, operators) plus the raw SQL: `provider_no_seq`, `NULLS NOT DISTINCT` unique indexes, and CHECK constraints. Prisma cannot model those indexes, so `prisma migrate diff` reports them as drift by design.
- Provider API (role PROVIDER, ownership always taken from the session): profile create/read/update, required-document list, document upload/replace/remove, bank account save (AES-256-GCM, masked everywhere) and the submission checklist.
- `assertProviderEditable` (single edit-lock helper), the required-documents policy (ID and bank proof, registration certificate for non-individuals, a pilot licence once for drones, an RC per active tractor/combine) and `listableProviderWhere()` (FR-PRV-12) are in place and tested.
- File download policy now covers providers: the provider owner and officers with `provider.view` inside their jurisdiction can read provider files, officer reads write a `FILE_VIEW` audit row, and replaced (soft-deleted) files stay readable to officers only.
- Admin user scope now includes farmer, provider and operator accounts in the officer's district or mandal (this closes the Phase 1 gap).
- Frontend: provider onboarding (type cards, then details), profile page with inline officer remarks, documents page, bank page, dashboard with real status banner and checklist (closes F11 and the provider half of F12), status badge, remark notice and checklist components.
- Not yet built (later phases): equipment, coverage/hours, operators and availability endpoints, submission, and the verification history. Their checklist items are computed from the tables but cannot be completed through the UI until then.
- Verification: backend 124 tests, frontend 36.

### Phase 5: equipment, units, photos and rate card: complete

- Equipment API under `/providers/me/equipment`: list, create (units and 1-5 photos in one transaction), read, update, activate/deactivate, ordered photo set, units (add, registration number, drone UIN) and the rate card (create, merge-style patch, soft delete). All writes lock the provider row and use the shared edit lock; equipment is editable in DRAFT, RETURNED, APPROVED and SUSPENDED. Other providers' equipment returns 404 on every verb.
- Rate card rules: the operation must belong to the category; travel fields must match the travel mode (mirrors the DB CHECK, reported as field errors); a duplicate returns `409 SERVICE_EXISTS`, but a removed service is revived; changing the travel mode clears the old mode's fields; money is integer paise.
- Rate caps (FR-PRV-07) are enforced on create and patch only while the `rateCapsEnabled` setting is true (district cap first, then the statewide cap). The admin screens to switch it on and manage caps were added in Phase 9.
- Equipment feeds the required-documents policy (an RC per active tractor, one pilot licence for drones) and the submission checklist.
- Frontend: equipment list, two-step create wizard, and a detail page with Details, Photos, Units and Rate card tabs. Rate card editing converts rupees to paise and shows travel fields only for the selected mode.
- Fixed while testing: `.partial()` on a field with `.default()` still applies the default, so every rate-card PATCH silently reset the minimum charge and travel mode. The patch schema no longer derives from the defaulted create schema.
- A category change is refused (409) once services or documents depend on the equipment.
- Verification: backend 140 tests, frontend 43.

### Phase 6: coverage, working hours, operators and availability: complete

- Coverage and hours (`PUT /providers/me/coverage`, `PUT /providers/me/working-hours`): radius mode or a list of mandals and villages (deduplicated, active places only), and a weekly schedule stored as minutes (end may be 24:00). Both follow the coverage edit lock (open in DRAFT, RETURNED, APPROVED and SUSPENDED). The provider payload now includes the names of the chosen areas.
- Operators: a provider creates an operator with a username and temporary password in one transaction (account, OPERATOR role, onboarding, optional licence file, assigned equipment). Update, equipment assignment, deactivate/activate (revokes sessions, blocks login) and password reset are all scoped to the provider and open in every status except REJECTED and BLACKLISTED. The operator's own `GET /operator/me` returns the provider status and assigned equipment with units. A new operator is forced to change the temporary password before anything else, and cannot reach provider, farmer or admin endpoints.
- Availability blocks: per-unit blocks with overlap detection under a per-unit advisory lock (adjacent blocks are allowed; six simultaneous identical requests produce exactly one success), limits of 180 days per block and a 92-day listing window, and the same status rule as operators.
- Operator licences are now readable by in-jurisdiction officers (audited) through the file download policy.
- Frontend: coverage and hours page, operator list/create/detail (one-time credentials with print, equipment assignment, deactivate, reset), availability page, and the operator dashboard backed by `/operator/me`. `GeoSelect` now reports the display names of the selection.
- The equipment list now includes unit ids so the availability page can offer a unit picker.
- Verification: backend 166 tests, frontend 48.

### Phase 7: submission and verification: complete

- Submit (`POST /providers/me/submit`): DRAFT or RETURNED to SUBMITTED, re-checking the checklist under the provider row lock. Anything incomplete returns `422 APPLICATION_INCOMPLETE` listing the undone checklist keys; a returned document or bank row also blocks resubmission until it is replaced. Only one of several simultaneous submissions succeeds. `GET /providers/me/verification-history` lists every transition newest first, with the actor shown as a role.
- Officer API (`/admin/providers`, scoped by jurisdiction, 404 outside it): queue with filters, search, pagination, pending-item counts and oldest-first ordering for SUBMITTED; full detail (profile, required documents with file links, masked bank, equipment with photos and rate card, coverage, hours, operators, history); document and bank review (remarks required to return); the audited bank-account reveal; and `verify` (APPROVE needs every required document and the bank account accepted, RETURN needs at least one remark or returned item, REJECT needs remarks) plus suspend, blacklist and reinstate. Every transition locks the provider, checks the from-status (`409 INVALID_STATE`), writes a verification row and an audit row. Simultaneous conflicting decisions resolve to exactly one winner.
- Permissions: `provider.view` for the queue and detail (district/state officers, mandal officers, helpdesk), `provider.verify` for reviews, approve/return/reject and the reveal, `provider.suspend` for suspend/blacklist/reinstate.
- Frontend: submit and resubmit with a confirmation on the provider dashboard plus the history timeline; officer queue with status tabs, type, search and (for state level) district filters; review screen with per-field and per-equipment remark inputs, document and bank review, "accept all pending", audited reveal, history, and a sticky action bar (approve disabled with a reason until everything is accepted; return, reject, suspend, blacklist and reinstate via a remarks dialog).
- Reliability fixes made while testing: Prisma `_count` and relation-heavy reads issued inside a transaction send overlapping queries down the transaction's single connection, which the pg driver deprecates. The checklist now uses flat sequential queries, the farmer read-backs happen after commit, and three `Promise.all` calls on transaction clients are sequential. The suite now runs without the pg deprecation warning.
- Test setup: jest-dom matchers are registered explicitly in `frontend/src/test/setup.ts`. The previous side-effect import intermittently failed to attach after the Vite cache was populated ("Invalid Chai property: toBeVisible").
- Verification: backend 186 tests, frontend 56.

### Phase 8: hardening and documentation: complete

- Browser tests (Playwright): the existing account specs were updated for the new onboarding screens, and new specs cover scenario 1 (farmer registers, completes the profile, adds a plot), scenario 2 (a provider builds the whole application and submits it), scenario 3 (officer returns it with remarks, the provider fixes and resubmits, the officer approves, the provider sees APPROVED), scenario 4 (an administrator deactivates the provider, who then sees the deactivated message, and can be reactivated) and an automated no-sideways-scroll check of every new page at 360, 768 and 1440 px for farmer, provider, district officer and field agent, plus the login and registration pages in Telugu. The review queue and review screen are checked at all three widths inside scenario 3.
- Test infrastructure: the runner points its helpers at the test database only, uses a temporary storage folder, creates officers directly in the test database (there is no public sign-up for them), and `db:test:prepare` now clears stored rate-limit counters so repeated runs do not hit registration limits.
- Documentation: Swagger now describes every Milestone 3 endpoint (request schemas, the multipart upload, path parameters, permissions and error responses); the Postman collection gained ten folders (93 requests) that chain through environment variables; `docs/api.md` lists conventions, error codes, the status machine and endpoint tables generated from the OpenAPI document; `docs/architecture.md` covers file storage, jurisdiction, sensitive fields, the status machine and concurrency; the README covers the new setup, operations and testing steps.
- Drift guards: tests fail if an OpenAPI reference is unresolved, a documented endpoint does not exist, a templated path lacks its parameter, a Milestone 3 write lacks the CSRF header in the docs, or a Postman request has no documented operation. A source scan fails if any write route lacks the origin and CSRF guard or reads a JSON body without validation.
- Cosmetic: saving anything other than the account profile now shows "Changes saved." instead of "Account changes saved."

#### Verification results

| Check                                                          | Result                              |
| -------------------------------------------------------------- | ----------------------------------- |
| `npm run typecheck`, `npm run lint`                            | clean                               |
| Backend tests (Vitest and Supertest against the test database) | all pass                            |
| Frontend tests (Vitest and Testing Library)                    | all pass                            |
| Playwright (12 tests, Microsoft Edge channel)                  | 12 of 12 pass in repeated full runs |

One scenario-3 run timed out once in about eight runs and could not be reproduced; request diagnostics were added to the browser helpers (any 401, 403 or 429 an actor receives is printed) to catch it. The cause is unconfirmed. One hypothesis is the rotating refresh token being used twice during a quick page reload, which the existing reuse detection treats as theft and answers by signing the user out (that behaviour is part of the Milestone 2 session design and was not changed); the diagnostics should show whether that is what happened if it recurs.

### Phase 9: optional rate caps: complete

- Backend: `GET` and `PUT /admin/settings/rate-caps-enabled` (audited as `RATE_CAPS_TOGGLED`), `GET`, `POST` and `PATCH /admin/rate-caps` (audited), all behind `settings.manage` (super and state administrators). A cap is per category, operation and pricing basis, for one district or statewide; duplicates answer `409 CAP_EXISTS`, and the operation must be offered for the category. `GET /masters/rate-cap` gives a provider the cap that applies to their district, for the rate form.
- Enforcement lives in one shared function used when a rate-card line is created or updated: nothing happens while the setting is off; otherwise the district cap is checked first, then the statewide cap, and inactive caps are ignored. A rate above the cap answers `422 RATE_ABOVE_CAP` on `ratePaise`, with the maximum in rupees in the message. On update the cap is checked only when the rate or the pricing basis changes, so a rate set before a cap existed does not block edits to other fields.
- Frontend: an admin Settings page (`/admin/settings`) with the enforcement switch (confirmation dialog), the cap table (edit maximum, deactivate or reactivate) and an add form; the rate card form shows the applicable maximum next to the rate field while caps are on. English and Telugu strings added.
- Documentation: Swagger, Postman (a Rate caps folder) and `docs/api.md` updated; Telugu strings are listed in `docs/telugu-review.md`.

### Deferred or open items

| Item                                                      | Status                                                                                                           |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Penny-drop bank verification                              | Deferred until a payment gateway is chosen. Officers check the account against the bank-proof document.          |
| Encryption of uploaded files at rest and malware scanning | Deferred; required before production.                                                                            |
| Map picker and plot polygons                              | Deferred. The API accepts a GeoJSON boundary; the UI has latitude and longitude with a "use my location" button. |
| Real LGD geography                                        | The department supplies it; load it with `db:import-geo`. Only sample data is seeded.                            |
| Master-data admin screens                                 | Next milestone. Masters are seeded and imported.                                                                 |
| Self-service password recovery                            | Not possible without OTP or email. An administrator, provider or field agent resets it.                          |
| Re-verification after approval                            | Excluded by the client. After approval the profile, provider documents and bank details are read-only.           |
| Search, bookings, payments and later modules              | Later milestones. `listableProviderWhere()` is ready for search to use.                                          |
| Telugu wording                                            | Best effort; every string is listed in `docs/telugu-review.md` for the department to confirm.                    |
