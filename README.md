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

Set `VITE_DASHBOARD_PREVIEW=true` in the frontend environment and restart Vite to open the farmer and provider shells from the onboarding page. New accounts retain their actual onboarding status. Department users assigned an authorized role go directly to the department dashboard.

## Verification

```sh
npm run typecheck
npm run lint
npm run build
npm test
npx playwright install chromium
npm run test:e2e
```

The test commands apply migrations and seed the dedicated database. Set `DB_TEST_NAME` to a separate database whose name ends in `_test`. The Playwright suite starts isolated frontend and backend servers on ports 5180 and 5100. Set `PLAYWRIGHT_CHANNEL=msedge` or `chrome` in the shell if using a system browser.

## Postman

Import the [collection](docs/postman/Mana%20Yantram.postman_collection.json) and [local environment](docs/postman/Mana%20Yantram%20Local.postman_environment.json). Activate the environment and fill `username` and `password`. Register or sign in, then send protected requests with the captured `accessToken`. Postman's cookie jar sends the refresh cookie. Set `newPassword` before testing password change. Portal requests require an account with the corresponding role.

## Troubleshooting

- Readiness 503 means the API cannot query PostgreSQL. Check the service, connection URL and credentials before retrying.
- If registration returns `ROLE_UNAVAILABLE`, run the seed against the same database as the API.
- Use the same browser hostname for the frontend and API. If the frontend address changes, update the exact origin in `CORS_ORIGIN`. Cookie-authenticated writes also require `X-CSRF-Protection: 1`.
- If a session ends after a password change, logout or refresh reuse, sign in again. The server verifies that the session family is still active on every protected request.
- On startup environment errors, check the variable names printed by the backend and compare their formats to `.env.example`.

See [architecture](docs/architecture.md), the [API guide](docs/api.md) and [implementation status](docs/implementation-status.md) for design decisions, current coverage and milestone boundaries. Password-only access is intended for local development and restricted demonstrations. Geographic masters, agricultural business profiles and detailed onboarding are planned for Milestone 3.
