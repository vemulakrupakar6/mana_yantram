# Mana Yantram (మన యంత్రం)

Mana Yantram is a React and Express foundation for an English and Telugu farm machinery and services marketplace. Farmers and providers can register with a username and password. Assigned roles control portal access. Dashboard shells show the initial account state and examples of service categories.

## Requirements

- Node.js 22.13+, 24 LTS, or newer supported releases, with npm
- PostgreSQL and access to create development and test databases
- Docker Compose if you want to run PostgreSQL in a container
- Chromium for the browser tests, or installed Chrome or Edge

The React/Vite client uses TypeScript, Tailwind, shadcn-style Radix primitives, React Router, Axios, TanStack Query, Zustand, React Hook Form, Zod and i18next. The Express API uses Prisma, PostgreSQL, Argon2id, JWT, Zod, Pino and OpenAPI.

## Setup

1. Run `npm ci` from the repository root.
2. Copy `backend/.env.example` to `backend/.env` and `frontend/.env.example` to `frontend/.env`. Example files describe the supported variables.
3. Set `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, and `DB_PASSWORD` in `backend/.env`. Enter the password as you would in pgAdmin. Quote it if it contains `#` or starts or ends with whitespace. For automated tests, create a separate database such as `mana_yantram_test` and set `DB_TEST_NAME`.
4. Generate a JWT secret with `node -p "require('node:crypto').randomBytes(48).toString('hex')"` and put the result in `JWT_ACCESS_SECRET` in `backend/.env`.
5. Generate the Prisma client, apply migrations and seed roles.

```sh
npm run prisma:generate -w backend
npm run db:migrate -w backend
npm run db:seed -w backend
```

An existing `DATABASE_URL` or `TEST_DATABASE_URL` environment variable takes precedence for its corresponding database.

For Docker, set `POSTGRES_PASSWORD` in the shell or a root `.env` and run `docker compose up -d postgres`. The default database and user are `mana_yantram`. Set `POSTGRES_PORT` if port 5432 is occupied. Create the dedicated test database using the configured database user.

This checkout is configured with an isolated Windows PostgreSQL cluster in the ignored `.local/pgdata` directory, bound to `127.0.0.1:55432`. If you reboot or stop that cluster, you can restart it from this repository using PowerShell.

```powershell
& 'C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe' -D .local/pgdata -l .local/postgres.log -o '-h 127.0.0.1 -p 55432' -w start
```

## Run

```sh
npm run dev
```

- Frontend at [localhost:5173](http://localhost:5173/)
- Backend Swagger at [localhost:5000/api-docs](http://localhost:5000/api-docs/)
- Health and PostgreSQL readiness at `/api/v1/health` and `/api/v1/health/ready`

You can also run `npm run dev -w frontend` and `npm run dev -w backend` in separate terminals. For a compiled API use `npm run build -w backend` followed by `npm run start -w backend`.

## Demo accounts and dashboard previews

The seed always installs nine roles and portal permissions. Set `SEED_DEMO_USERS=true` in the backend environment together with `DEMO_FARMER_PASSWORD`, `DEMO_PROVIDER_PASSWORD`, `DEMO_DISTRICT_OFFICER_PASSWORD` and `DEMO_STATE_ADMIN_PASSWORD`. Then rerun the seed. It creates `farmer_demo`, `provider_demo`, `district_officer_demo` and `state_admin_demo` once. Existing demo passwords can be changed from the account page. Demo accounts are disabled by default and production-mode startup rejects demo seeding.

Set `VITE_DASHBOARD_PREVIEW=true` in the frontend environment and restart Vite to open the farmer and provider dashboards by URL before onboarding is finished (the browser tests use it). New accounts retain their actual onboarding status, and the onboarding page now asks for the farmer profile or the provider type and unit details. Department users assigned an authorized role go directly to the department dashboard.

## Verification

```sh
npm run typecheck
npm run lint
npm run build
npm test
npx playwright install chromium
npm run test:e2e
```

The test commands apply migrations and seed the dedicated database. Set `DB_TEST_NAME` to a separate database whose name ends in `_test`, and make sure `DATABASE_URL` in `backend/.env` does not point at that same database (the safety check refuses to run otherwise). Preparing the test database also clears stored rate-limit counters, so repeated runs never hit registration limits.

The Playwright suite starts isolated frontend and backend servers on ports 5180 and 5100 and uses a temporary file storage folder. Set `PLAYWRIGHT_CHANNEL=msedge` or `chrome` in the shell to use a system browser instead of downloading Chromium. It covers: the account flows; a farmer completing the profile and adding a plot; a provider building and submitting a full application; an officer returning it, the provider fixing and resubmitting, and approval; an administrator deactivating the provider; and an automated check that every new page fits 360, 768 and 1440 px without sideways scrolling, in English and Telugu.

## Postman

Import the [collection](docs/postman/Mana%20Yantram.postman_collection.json) and [local environment](docs/postman/Mana%20Yantram%20Local.postman_environment.json). Activate the environment and fill `username` and `password`. Register or sign in, then send protected requests with the captured `accessToken`. Postman's cookie jar sends the refresh cookie. Set `newPassword` before testing password change and `temporaryPassword` (12 or more characters) before creating users, operators or assisted farmers. The Milestone 3 folders chain through environment variables that earlier requests fill in (`districtId`, `fileId`, `providerId`, `equipmentId`, ...), so run each folder top to bottom with the matching role: farmer, provider, field agent, or a district officer or administrator for the department folders. Portal requests require an account with the corresponding role.

## Troubleshooting

- Readiness 503 means the API cannot query PostgreSQL. Check the service, connection URL and credentials before retrying.
- If registration returns `ROLE_UNAVAILABLE`, run the seed against the same database as the API.
- Use the same browser hostname for the frontend and API. If the frontend address changes, update the exact origin in `CORS_ORIGIN`. Cookie-authenticated writes also require `X-CSRF-Protection: 1`.
- If a session ends after a password change, logout or refresh reuse, sign in again. The server verifies that the session family is still active on every protected request.
- On startup environment errors, check the variable names printed by the backend and compare their formats to `.env.example`.

See [architecture](docs/architecture.md), the [API guide](docs/api.md) and [implementation status](docs/implementation-status.md) for design decisions, current coverage and milestone boundaries. Password-only access is intended for local development and restricted demonstrations. See [implementation status](docs/implementation-status.md) for what Milestone 3 delivers and what is deferred.

## Milestone 3 operations

New backend environment variables (see `backend/.env.example`): `STORAGE_ROOT`, `UPLOAD_MAX_DOCUMENT_MB`, `UPLOAD_MAX_PHOTO_MB`, `FIELD_ENCRYPTION_KEY` (32 random bytes, base64) and `AADHAAR_HASH_KEY` (32+ characters). Generate the encryption key with `node -p "require('node:crypto').randomBytes(32).toString('base64')"`. Uploaded files live under `backend/storage/` (git-ignored).

- **First administrator:** set `BOOTSTRAP_ADMIN_USERNAME` and `BOOTSTRAP_ADMIN_PASSWORD` (12–128 characters) in the shell, then run `npm run db:seed -w backend` followed by `npm run admin:create -w backend`. It refuses if a SUPER_ADMIN already exists unless `--force` is passed, and in production it refuses a password read from a `.env` file.
- **Geography:** `npm run db:seed -w backend` loads a small sample (fake LGD codes starting with `T`). Load real data with `npm run db:import-geo -w backend -- path/to/geo.csv` (columns: `district_lgd,district_en,district_te,mandal_lgd,mandal_en,mandal_te,village_lgd,village_en,village_te`). The import upserts by LGD code and never deletes. IFSC data can optionally be loaded with `npm run db:import-ifsc -w backend -- path/to/ifsc.csv` (columns `ifsc,bank,branch,district`); while that table is empty only the IFSC format is checked.
- **Passwords:** every account signs in with username and password; there is no OTP. Accounts created by someone else (a department user by an admin, an operator by a provider, or a farmer by a field agent) start with a temporary password and must change it before anything else. There is no self-service password recovery: ask your provider, field agent or the department helpdesk to reset it.
- **Uploaded files** are stored on the server disk under `STORAGE_ROOT` (default `backend/storage/`) and are referenced from the database. They are not backed up, scanned for malware or encrypted at rest yet; include the folder in your backups and treat both as required before production.
- **Rate caps** (an optional rule limiting what providers can charge) are off by default. A state or super administrator turns enforcement on and manages the caps in the admin portal under Settings (`/admin/settings`). A district cap wins over a statewide cap; providers see the applicable maximum next to the rate field, and a rate above it is refused with `RATE_ABOVE_CAP`. Existing rates are never changed, and editing other fields of an above-cap line is still allowed.
- **Reviewing providers:** department users with `provider.view` see applications in their jurisdiction under _Providers_ (the _Verification_ menu opens the submitted queue); `provider.verify` allows review, approval, return and rejection; `provider.suspend` allows suspend, blacklist and reinstate.
