# DataTrack

DataTrack is a data acquisition CRM for tracking public-sector real estate data sources, requests, contacts, communications, tasks, and analyst reviews. It is designed for a nonprofit team acquiring California government data such as code violations, tax liens, tax sales, permits, assessments, and related datasets.

The current version is a browser-based React prototype packaged as a single HTML file. It can be opened locally for demos and testing, and it has early Supabase hooks for authentication and persistence.

## What The App Does

DataTrack helps a data acquisition team manage:

- Agencies: cities, counties, and special districts that own data sources
- Contacts: agency staff, departments, emails, phone numbers, and notes
- Datasets: target data sources, acquisition method, status, cost, refresh cadence, and feasibility
- Communications: emails, calls, CPRA/FOIA interactions, outcomes, and follow-up dates
- Requests: CPRA, API access, direct purchase, and manual request workflows
- Tasks: follow-ups, data reviews, clarifications, assignments, due dates, snoozing, and completion
- Data reviews: analyst feedback on received files using preset issue tags and custom notes
- Settings: users, roles, email templates, and system defaults

## Current App Files

| File | Purpose |
| --- | --- |
| `DataTrack_v11plus.html` | Runnable app. Open this in a browser or serve it locally. |
| `DataTrack_v11plus.jsx` | Main JSX source for the app. |
| `DataTrack_v11plus_dev.jsx` | ES module development version. |
| `DataTrack_Acquire_Handoff.md` | Detailed technical handoff, schema, features, and version history. |
| `Supabase_integration_plan.md` | Step-by-step Supabase integration plan. |
| `DataTrack_Build_Plan.md` | Build plan, timeline, roles, and infrastructure notes. |
| `DataTrack_PM_Briefing.md` | Project manager briefing and team coordination notes. |
| `README_handoff.md` | Original handoff README preserved for reference. |

## Run Locally

The app can be opened directly, but using a local HTTP server is better because browser auth flows and Supabase requests behave more reliably over `http://localhost` than `file://`.

From this folder:

```bash
python3 -m http.server 5174
```

Then open:

```text
http://localhost:5174/DataTrack_v11plus.html
```

If port `5174` is already in use, choose another port:

```bash
python3 -m http.server 5175
```

## Authentication And Password Reset

The app includes a sign-in screen and a `Forgot password?` flow using Supabase Auth.

For authentication to work, the constants at the top of the app must point to a valid Supabase project:

```js
const SUPABASE_URL = "https://your-project.supabase.co";
const SUPABASE_ANON_KEY = "your-anon-public-key";
```

Update these in:

- `DataTrack_v11plus.html`
- `DataTrack_v11plus.jsx`
- `DataTrack_v11plus_dev.jsx`

In Supabase, also add the local app URL to Auth redirect URLs:

```text
http://localhost:5174/DataTrack_v11plus.html
```

If the app shows that the Supabase project URL is not resolving, replace the hardcoded Supabase URL/key with the values from **Supabase Project Settings > API**.

## Data And Persistence

This prototype still includes local in-memory seed data so the UI can be demoed immediately. It also contains Supabase-backed read/write helpers for several records.

Important current behavior:

- If Supabase is configured and reachable, the app attempts to load data from Supabase tables.
- If Supabase is missing, unreachable, or not fully seeded, the prototype may not persist changes as expected.
- The full intended schema is documented in `DataTrack_Acquire_Handoff.md`.

## Development Notes

The app currently has no package manager, build system, or local framework server. It relies on CDN scripts for React and Supabase.

Recommended workflow:

1. Edit `DataTrack_v11plus.jsx` for source changes.
2. Keep `DataTrack_v11plus.html` updated if the browser prototype needs to reflect those changes immediately.
3. Use the local HTTP server for manual testing.
4. Commit and push changes to GitHub after verifying the app still loads.

## GitHub

This folder is connected to:

```text
https://github.com/Serve-Foundation/DataTrack.git
```

Local `main` has been reconciled with `origin/main`. Normal changes can be committed and pushed from this folder.

## Roadmap

Near-term priorities:

- Replace remaining in-memory writes with Supabase persistence.
- Move Supabase URL and anon key out of hardcoded source and into deployment environment configuration.
- Add a proper build setup or lightweight app structure.
- Deploy the app to a stable hosted URL.
- Add stronger error handling around auth, data loading, and saves.
- Add tests once the app is moved into a standard build environment.
