# DataTrack

DataTrack is an internal data acquisition CRM for tracking public-sector real estate data sources, agency relationships, requests, communications, tasks, and analyst reviews. It is designed for nonprofit staff and volunteers who need one shared place to manage the work of finding, requesting, receiving, and reviewing California government datasets such as code violations, tax liens, tax sales, permits, assessments, and related real estate data.

The current version is a browser-based React app packaged as static HTML. It is live on GitHub Pages, uses Supabase for authentication and data, and can also be run locally for testing.

## Live App

Open the current deployed app here:

```text
https://serve-foundation.github.io/DataTrack/
```

## What Internal Users Can Do

DataTrack supports the main day-to-day workflows for a data acquisition team:

- View a dashboard of agencies, datasets, requests, communications, tasks, and recent activity.
- Track agencies that own or publish target data, including city, county, and special district records.
- Store agency contacts with departments, titles, email addresses, phone numbers, and relationship notes.
- Track datasets by category, acquisition status, delivery format, refresh frequency, cost, automation feasibility, and source URLs.
- Log communications with agencies, including emails, calls, CPRA/FOIA messages, portal interactions, outcomes, follow-up dates, and linked records.
- Manage public records requests, API access requests, direct purchase requests, and manual data requests from draft through closure.
- Assign and track tasks for follow-ups, data reviews, clarifications, requested files, blocked items, and general acquisition work.
- Snooze tasks, complete tasks, and keep task note history so handoffs are easier.
- Review received data files using analyst feedback presets and custom notes.
- Add notes to agencies, contacts, requests, and tasks to preserve context over time.
- Use settings for team users, roles, email templates, and system defaults.

## Features Added

- Live GitHub Pages deployment with a clean root URL.
- Dashboard with clickable metrics, role-based views, pipeline summaries, overdue task alerts, and recent activity.
- Agency directory with search, filters, sorting, pagination, detail tabs, linked contacts, linked datasets, communications, and notes.
- Contact directory and contact detail pages with agency links, communication history, notes, and multi-value emails and phone numbers.
- Dataset tracking with acquisition status, method, category, format, refresh cadence, cost, portal/API fields, and analyst review panels.
- Communication logging for email, phone, FOIA/CPRA, and portal interactions, including direction, outcome, follow-up date, templates, linked records, and edit history.
- Request tracking for CPRA, FOIA, API access, direct purchase, and manual data requests with statuses, assignees, contacts, costs, references, notes, and communication threads.
- Task management with assignees, priorities, due dates, linked records, note history, assignment history, complete action, snooze options, and follow-up task creation.
- Analyst data review workflow with preset feedback tags, review statuses, custom notes, and file-level review history.
- Record creation and editing flows for agencies, contacts, datasets, requests, communications, tasks, and reviews.
- Password sign-in screen and forgot-password reset flow connected to Supabase Auth.
- Admin settings area for users, roles, email templates, and system configuration.

## Main App Areas

| Area | What it is used for |
| --- | --- |
| Dashboard | Team overview, pipeline status, overdue work, and quick navigation. |
| Agencies | Source agencies, jurisdiction details, linked contacts, datasets, communications, and notes. |
| Contacts | People inside agencies, including contact methods and communication history. |
| Datasets | Target datasets, acquisition status, methods, formats, cost, cadence, and analyst review. |
| Communications | Logged interactions with agencies and contacts, including follow-up tracking. |
| Requests | Formal and informal data request workflow tracking. |
| Tasks | Shared work queue for follow-ups, reviews, clarifications, and assignments. |
| Settings | User roles, templates, and system-level configuration. |

## Current App Files

| File | Purpose |
| --- | --- |
| `index.html` | GitHub Pages entry point for the clean root URL. |
| `DataTrack_v11plus.html` | Runnable app. Open this in a browser or serve it locally. |
| `DataTrack_v11plus.jsx` | Main JSX source for the app. |
| `DataTrack_v11plus_dev.jsx` | ES module development version. |
| `simple-create-account-gateway.sql` | Supabase trigger for new user signup flow. |

## Reference Docs

Historical planning and handoff documents are in the `docs/` folder.

| File | Purpose |
| --- | --- |
| `docs/DataTrack_Acquire_Handoff.md` | Detailed technical handoff, schema, features, and version history. |
| `docs/Supabase_integration_plan.md` | Step-by-step Supabase integration plan. |
| `docs/DataTrack_Build_Plan.md` | Build plan, timeline, roles, and infrastructure notes. |
| `docs/DataTrack_PM_Briefing.md` | Project manager briefing and team coordination notes. |
| `docs/simple-create-account-plan.md` | Original account creation planning notes. |
| `docs/README_handoff.md` | Original handoff README preserved for reference. |

## Run Locally

The app can be opened directly, but using a local HTTP server is better because browser auth flows and Supabase requests behave more reliably over `http://localhost` than `file://`.

From this folder:

```bash
python3 -m http.server 5174
```

Then open:

```text
http://localhost:5174/
```

If port `5174` is already in use, choose another port:

```bash
python3 -m http.server 5175
```

## Authentication And Account Access

The app includes a sign-in screen, a `Forgot password?` flow, password reset handling, and a simple `Create account` gateway using Supabase Auth.

When a user creates an account, they enter their full name, email, password, and requested app role. The app sends those details to Supabase Auth as user metadata. After the user confirms their email and signs in, DataTrack uses the existing Supabase session flow to load the app.

To make new signups appear in **Settings -> Users & Roles**, run `simple-create-account-gateway.sql` in the Supabase SQL Editor. The SQL creates a trigger on `auth.users` that inserts or updates the matching row in `public.users`, keeps the new user active, stores the selected role, and falls back to `viewer` if the role is missing or invalid.

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
http://localhost:5174/
```

Also set the deployed app as an allowed Auth redirect URL, and preferably as the Site URL:

```text
https://serve-foundation.github.io/DataTrack/
```

Password reset and signup confirmation emails use this deployed URL. If Supabase is still configured with `http://localhost:3000` as the Site URL and the deployed URL is not allow-listed, reset links may open a dead localhost page.

If the app shows that the Supabase project URL is not resolving, replace the hardcoded Supabase URL/key with the values from **Supabase Project Settings > API**.

## Data And Backend

DataTrack uses Supabase for authentication and backend data.

Important backend behavior:

- The app signs users in through Supabase Auth.
- App records are loaded from Supabase tables when the configured project is reachable.
- Create, edit, and delete actions are wired through Supabase-backed helpers for the supported records.
- The database schema is documented in `DataTrack_Acquire_Handoff.md`.

## Development Notes

The app currently has no package manager, build system, or local framework server. It relies on CDN scripts for React and Supabase.

Recommended workflow:

1. Edit `DataTrack_v11plus.jsx` for source changes.
2. Keep `DataTrack_v11plus.html` and `index.html` updated if the deployed app needs to reflect those changes immediately.
3. Use the local HTTP server for manual testing.
4. Commit and push changes to GitHub after verifying the app still loads.

## GitHub

This folder is connected to:

```text
https://github.com/Serve-Foundation/DataTrack.git
```

Local `main` has been reconciled with `origin/main`. Normal changes can be committed and pushed from this folder.
