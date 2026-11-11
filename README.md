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
| `QA_SUITE` | `on` | Optional. Makes this deployment a target for the full suite from the QA console. Turns `CAPTCHA` and `EMAIL_CODE` off |
| `SETUP_KEY` | a long random string | Optional. Turns on the `/setup` page, which creates the QA test data. Unset it when done |

The tables can start empty: a new visitor can sign up and use everything. The test suite needs the fictional client organizations and the QA accounts: create them with the `/setup` page (see below), or with `npm run db:seed` (Supabase variables in `.env.local`), which wipes the tables first.

`.env.example` lists every variable the project reads.

## Switches

- `BUGS=<id>,<id>` plants bugs. The list is in `lib/bug-catalog.ts`. `slow-documents` is slow but working, so the suite must still pass.
- `CAPTCHA=on` adds a built-in CAPTCHA (five digits drawn as lines) to sign-in and sign-up. Off by default. Checked on the server with a signed token, so it needs no storage.
- `EMAIL_CODE` adds an email code step to sign-up. Three values:
  - `off` (default): no email step.
  - `demo`: no email is sent; `/inbox` shows the code for the sign-up in progress in that browser.
  - `supabase`, or `on`: Supabase Auth emails a real code and checks it. Needs `SUPABASE_URL` and `SUPABASE_SECRET_KEY`. The site still keeps its own accounts; Supabase only sends and checks the code, which adds a row to Supabase's `auth.users` for each address.
- `AI_MODE=mock|claude|replay` picks the AI. `replay` serves recorded answers only.
- `QA_SUITE=on` marks the deployment as a target for the full suite (see below). It always turns `CAPTCHA` and `EMAIL_CODE` off, so use a second deployment to show those.
- `SETUP_KEY=<key>` turns on `/setup`. Without it the page and its API answer 404.

`npm run qa` always runs with `CAPTCHA` and `EMAIL_CODE` off, because the suite does not solve them.

## Run the 22 tests from the console against this deployment

The QA console runs the same 22 tests as `npm run qa` against this site, with its live browser view.

Vercel settings (Production environment):

| Variable | Value |
|---|---|
| `STORE` | `supabase` |
| `SUPABASE_URL` | your project URL |
| `SUPABASE_SECRET_KEY` | the secret key |
| `QA_SUITE` | `on` |
| `SETUP_KEY` | a long random string you keep |
| `BUGS` | optional, for example `upload-button-dead`, to show a bug being caught |

Then:

1. Redeploy, so the variables apply.
2. Open `https://<your-site>/setup`, type the setup key and press Create QA test data. It makes sure the fictional client organizations, the canary document and the QA organization exist, and creates the QA bot and QA viewer with new passwords and authenticator keys. Nothing else is touched. Running it again replaces both logins; the old ones stop working.
3. Copy the bot's email, password and authenticator key. They are shown once.
4. In the console, add the site's address as a workspace and press Full access test. When the run asks in the chat, paste the bot login.

With `QA_SUITE=on`, `GET /api/health` answers `{ "ok": true, "standIn": true, "signInPath": "/login" }`, which is how the console knows to run the full suite and where to sign in. The role tests need the viewer login too; without it they are reported as not run.

## To get real email codes

With `EMAIL_CODE=supabase` (or `on`):

1. In the Supabase dashboard, open Authentication, Email Templates, Magic Link, and put `{{ .Token }}` in the body, for example `Your code: {{ .Token }}`. Without it Supabase sends a link instead of a code.
2. The built-in sender only delivers to the email addresses of your Supabase organization's team members, and only about 2 emails an hour for the whole project. Other addresses get "Supabase's built-in email only delivers to your project's team addresses".
3. To send to any address, add custom SMTP under Authentication settings (SMTP). That also lifts the hourly limit.

Each address can ask for a new code once a minute, and a code lasts an hour. Codes are 6 to 8 digits depending on the project.

## Endpoints worth knowing

- `GET /api/health` answers `{ "ok": true }`, plus `"standIn": true, "signInPath": "/login"` with `QA_SUITE=on`.
- `POST /api/setup` with `{ "key": "<SETUP_KEY>" }` creates the QA test data and returns the QA logins. 404 without `SETUP_KEY`.
- `GET /api/environment` says which AI mode and store are in use. The suite records it in each report.

## Where AI tools were used

This project was written with help from Claude (Anthropic), including this split into its own repository.
