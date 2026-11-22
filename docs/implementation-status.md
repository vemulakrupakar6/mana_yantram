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
