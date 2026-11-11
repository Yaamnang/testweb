# fake-client

A stand-in for a multi-tenant clinical AI platform, used as a test target. People sign up with a password and an authenticator app, create an organization, upload CSV files of adverse event reports, run an analysis job, download the report, invite teammates and change settings. All data is fictional.

It ships with its own end-to-end test suite (Playwright) and a set of planted bugs, so you can see the suite catch real regressions.

## Run it locally

Needs Node 22.

```
npm install
npm run dev
```

Open http://localhost:3000. With no settings it uses an in-memory store, reseeded on every start, and a mock AI that needs no key. Sign up at /signup.

## Run the tests

```
npx playwright install chromium
npm run qa
```

One command: it builds the site, starts it on port 3100 with throw-away QA accounts, runs 22 tests and prints PASS or FAIL. The report is in `qa-results/latest/report.md`.

- `npm run qa -- --bugs upload-button-dead` runs with a planted bug. The run should FAIL and say what broke.
- `npm run qa:bugs` runs once per planted bug and writes `results/bug-matrix.md`.
- `npm run qa:repeat` runs ten times and checks the results are identical.
- `npm run qa -- --target https://your-copy.example` tests a deployed copy. Set `QA_EMAIL`, `QA_PASSWORD`, `QA_TOTP_SECRET` and add the host to `QA_ALLOWED_HOSTS`.
- `npm run qa:report` opens the HTML report with traces.

## Deploy on Vercel

The in-memory store does not work on Vercel, because each request may run in a different process. Use Supabase.

1. Create a Supabase project of its own. Run `db/schema.sql` in its SQL editor. It only creates `eclypse_` tables.
2. Import the repository in Vercel. Framework preset Next.js, build command `next build`, Node 22. No other build settings.
3. Add these environment variables:

| Variable | Value | What it does |
|---|---|---|
| `STORE` | `supabase` | Uses Postgres instead of memory |
| `SUPABASE_URL` | your project URL | Where the data lives |
| `SUPABASE_SECRET_KEY` | the secret key | Server side only. Also used to derive the signing key if `CAPTCHA_SECRET` is not set |
| `CAPTCHA_SECRET` | a long random string | Optional. Signs CAPTCHA tokens and email codes. Changing it invalidates any in progress |
| `CAPTCHA` | `on` | Optional. CAPTCHA on sign-in and sign-up |
| `EMAIL_CODE` | `on`, `supabase` or `demo` | Optional. `on` or `supabase`: Supabase emails a real code at sign-up (see below). `demo`: the code shows at `/inbox` |
| `AI_MODE` | `mock` or `claude` | Optional. `claude` needs `ANTHROPIC_API_KEY` |
| `ANTHROPIC_API_KEY` | your key | Optional, for `AI_MODE=claude` |
| `BUGS` | bug ids, comma separated | Optional. Plants bugs, for a deployment the suite should catch |

The tables can start empty: a new visitor can sign up and use everything. `npm run db:seed` (with the Supabase variables in `.env.local`) wipes the tables and adds the fictional client organizations and the QA accounts, which the test suite needs when pointed at the deployment.

`.env.example` lists every variable the project reads.

## Switches

- `BUGS=<id>,<id>` plants bugs. The list is in `lib/bug-catalog.ts`. `slow-documents` is slow but working, so the suite must still pass.
- `CAPTCHA=on` adds a built-in CAPTCHA (five digits drawn as lines) to sign-in and sign-up. Off by default. Checked on the server with a signed token, so it needs no storage.
- `EMAIL_CODE` adds an email code step to sign-up. Three values:
  - `off` (default): no email step.
  - `demo`: no email is sent; `/inbox` shows the code for the sign-up in progress in that browser.
  - `supabase`, or `on`: Supabase Auth emails a real code and checks it. Needs `SUPABASE_URL` and `SUPABASE_SECRET_KEY`. The site still keeps its own accounts; Supabase only sends and checks the code, which adds a row to Supabase's `auth.users` for each address.
- `AI_MODE=mock|claude|replay` picks the AI. `replay` serves recorded answers only.

`npm run qa` always runs with `CAPTCHA` and `EMAIL_CODE` off, because the suite does not solve them.

## To get real email codes

With `EMAIL_CODE=supabase` (or `on`):

1. In the Supabase dashboard, open Authentication, Email Templates, Magic Link, and put `{{ .Token }}` in the body, for example `Your code: {{ .Token }}`. Without it Supabase sends a link instead of a code.
2. The built-in sender only delivers to the email addresses of your Supabase organization's team members, and only about 2 emails an hour for the whole project. Other addresses get "Supabase's built-in email only delivers to your project's team addresses".
3. To send to any address, add custom SMTP under Authentication settings (SMTP). That also lifts the hourly limit.

Each address can ask for a new code once a minute, and a code lasts an hour. Codes are 6 to 8 digits depending on the project.

## Endpoints worth knowing

- `GET /api/health` answers `{ "ok": true }`.
- `GET /api/environment` says which AI mode and store are in use. The suite records it in each report.

## Where AI tools were used

This project was written with help from Claude (Anthropic), including this split into its own repository.
