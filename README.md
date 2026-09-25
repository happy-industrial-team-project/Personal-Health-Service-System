# Personal Health Service System — Local Full-Stack Course Demo

This repository contains a local full-stack course-project system for managing fictional personal health information. It runs on your own computer at <http://localhost:3000> and stores its live data in a real local SQLite database; it does not connect to a hospital system or hosted production service.

## Demo account

Use the following fictional account on the sign-in screen:

```text
Email:    demo@health.local
Password: DemoHealth#2026
```

Do not reuse these credentials for a real account. The password is public because this is a self-contained classroom demo.

## What P0 currently covers

- Local authentication with a signed, HTTP-only session cookie, scrypt password verification, basic login rate limiting, and logout.
- Authenticated health-record listing, keyword/type/date filtering, and creation.
- Authenticated health-measurement listing and creation for blood pressure, blood glucose, heart rate, weight, temperature, and oxygen saturation.
- Clinician access-grant creation, expiry handling, listing, and revocation.
- Server-generated audit events for sign-in, sign-out, reads, writes, and permission changes.
- Local SQLite persistence with transactions, relational constraints, automatic schema migrations, and durable rollback journaling, so demo changes survive a browser refresh and server restart.
- Numeric line charts with point details, clearly marked demo reference ranges, and a systolic/diastolic view switch within one blood-pressure chart.
- Responsive navigation, keyboard-operable dialogs and forms, visible focus states, readable text sizing, and reduced-motion support.
- Conservative response headers for framing, MIME sniffing, referrer data, and unused browser capabilities.

The interface still uses fictional health information. Trend summaries are educational display logic, not diagnosis or medical advice.

## Run locally

Requirements: Node.js 22.13 or later and an internet connection for the first dependency installation.

### One-click start on Windows

1. Extract the project to a normal folder; do not run it inside a ZIP preview.
2. Double-click `START_DEMO.bat`.
3. Wait for the browser to open at <http://localhost:3000>.
4. Keep the command window open during the demonstration.

Run the project once before presentation day. After dependencies have been installed successfully, they normally do not need to be downloaded again.

### Manual start

Open PowerShell in the project directory and run:

```powershell
node tools/pnpm/bin/pnpm.mjs install --frozen-lockfile
node tools/pnpm/bin/pnpm.mjs run dev
```

Then open <http://localhost:3000>. To stop the server, return to the terminal and press `Ctrl+C`.

The repository includes a portable pnpm copy under `tools/pnpm`, so a global pnpm installation is not required.

## Local data, migration, and reset

The live local database is `data/phss.sqlite` by default. The server automatically applies its SQLite schema migrations whenever it opens the database.

When a new or empty SQLite database is initialized, the server imports bootstrap data in this order:

1. The legacy `data/store.json`, if it exists (or the file selected by `PHSS_DATA_FILE`).
2. Otherwise, the version-controlled fictional dataset in `data/seed.json`.

After this one-time import, new demo changes are stored in SQLite; the JSON bootstrap file is not used as the live database. The app uses SQLite's rollback journal with full synchronous writes, which suits this single-machine course system and avoids relying on WAL behavior across older supported Node.js releases.

The project uses Node.js's built-in `node:sqlite` driver so no native database package needs to be installed. Some supported Node.js releases may print an `ExperimentalWarning` for that built-in module; this does not mean database initialization failed.

To reset the SQLite database:

1. Stop the development server first so SQLite can close the database safely.
2. In PowerShell, from the project directory, run:

```powershell
Remove-Item -LiteralPath @(
  '.\data\phss.sqlite',
  '.\data\phss.sqlite-journal',
  '.\data\phss.sqlite-wal',
  '.\data\phss.sqlite-shm'
) -ErrorAction SilentlyContinue
```

3. Start the server again. The next data access recreates the database, applies migrations, and imports the legacy JSON file when present; otherwise it imports `data/seed.json`.

If you specifically want a clean reset from `data/seed.json`, make sure the legacy `data/store.json` is absent or move it aside before restarting. You can choose another SQLite path with `PHSS_DATABASE_FILE`; `PHSS_DATA_FILE` only selects a legacy JSON bootstrap source. A production-mode run also requires `PHSS_SESSION_SECRET` to contain at least 32 characters. These settings do not turn the demo into a production-ready system.

## Quality checks

```powershell
node tools/pnpm/bin/pnpm.mjs run typecheck
node tools/pnpm/bin/pnpm.mjs run db:check
node tools/pnpm/bin/pnpm.mjs run lint
node tools/pnpm/bin/pnpm.mjs run check
node tools/pnpm/bin/pnpm.mjs run build
```

`check` runs the TypeScript, ESLint, and Vinext compatibility checks together.

## Scope and limitations

- This is a university course project, not a medical device, clinical service, or source of medical advice.
- It is not suitable for real patient data and has not undergone a production security, privacy, regulatory, or clinical review.
- Accessibility improvements use WCAG 2.2 AA as an internal design reference where practical. The project has not been independently audited and does not claim formal WCAG conformance or certification.
- `data/phss.sqlite` is a local course-demo database. Transactions, constraints, and durable rollback journaling improve local data integrity, but the file is still intended for one machine rather than multiple application instances, serverless functions, containers with ephemeral disks, or a multi-user production workload.
- Before cloud deployment, move the schema and data to a managed database such as Cloudflare D1 or PostgreSQL, add deployment-grade migration and backup procedures plus server-side authorization tests, provision secrets outside the repository, and perform an appropriate security/privacy review.
- Imported hospital records, real clinician identity verification, clinical interoperability, notifications, account recovery, encryption-key management, and the optional social features remain outside this P0 demo.
- All names, organizations, measurements, and records included with the project are fictional.

If port 3000 is already in use, stop the other local development server or configure a different port before starting this demo.
