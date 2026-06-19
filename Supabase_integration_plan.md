# Plan: Getting Started with Supabase for DataTrack

## Context
DataTrack is a single-file React prototype (`DataTrack_v11plus.html`) with all data hardcoded as in-memory JS arrays. There is no backend, no auth, and no persistence across page reloads. The goal is to wire Supabase as a real database so data persists, multiple users can collaborate, and the app can eventually be deployed remotely.

The app has no build system (no npm, no bundler) — it uses React from CDN. Supabase JS client is also available via CDN, so no build tooling is needed.

---

## Critical Files
- `DataTrack_v11plus.html` — the runnable app (pre-compiled JSX + hardcoded data)
- `DataTrack_v11plus.jsx` — source JSX (edit this, then recompile into HTML)
- `DataTrack_Acquire_Handoff.md` — full DB schema (11 tables, all fields defined)

---

## Step-by-Step Plan

### Step 1: Create Your Supabase Project (15 min)
1. Go to [supabase.com](https://supabase.com) → Sign up with your org's email (free)
2. Click **New Project**
3. Set a project name (`datatrack`), database password (save this), and region (US West for CA data)
4. Wait ~2 minutes for provisioning
5. Go to **Project Settings → API** and copy:
   - `Project URL` (looks like `https://xxxx.supabase.co`)
   - `anon public` key (long JWT string)
   - Keep these — you'll paste them into the app

---

### Step 2: Create the Database Schema (30–45 min)
In Supabase dashboard → **SQL Editor**, run the migration SQL to create all 11 tables.
The schema is fully defined in `DataTrack_Acquire_Handoff.md` — translate each table definition into `CREATE TABLE` SQL.

Key tables to create in this order (respects foreign keys):
1. `users`
2. `agencies`
3. `contacts` (FK → agencies)
4. `datasets` (FK → agencies)
5. `email_templates`
6. `feedback_presets`
7. `communications` (FK → agencies, contacts, datasets)
8. `requests` (FK → agencies, datasets, contacts)
9. `tasks` (FK → agencies, contacts, datasets, requests)
10. `notes`
11. `data_reviews` (FK → datasets)

JSONB columns to note (store as `jsonb` type in Postgres):
- `agencies.emails`, `agencies.phones`
- `contacts.emails`, `contacts.phones`
- `communications.edit_log`
- `requests.edit_log`
- `tasks.note_history`, `tasks.assignment_history`

---

### Step 3: Seed Initial Data (30 min)
The existing mock data (35 agencies, 45 contacts, 30 datasets, etc.) lives in the hardcoded arrays at the top of `DataTrack_v11plus.jsx` (lines 4–20).

Two options to seed:
- **Option A (easiest):** Supabase dashboard → **Table Editor** → paste rows manually for small tables (users, email_templates, feedback_presets)
- **Option B (for agencies/contacts):** Export the JS arrays to JSON, then use Supabase dashboard → **Table Editor → Import CSV** or run `INSERT` SQL

---

### Step 4: Add Supabase Client to the App (10 min)
In `DataTrack_v11plus.html`, add the Supabase CDN script just before the React scripts (line ~19):

```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
```

Then near the top of the `<script>` block (after the React destructuring, ~line 22), initialize the client:

```js
const { createClient } = supabase;
const sb = createClient('YOUR_PROJECT_URL', 'YOUR_ANON_KEY');
```

Also add `useEffect` to the React destructure at the top:
```js
const { useState, useMemo, useEffect } = React;
```

---

### Step 5: Replace One Module (Start with Agencies) (1–2 hrs)
Don't replace everything at once. Start with `AgencyList` to validate the pattern works end-to-end.

**Reading data** — replace the hardcoded filter in `AgencyList` (~line 402):
```js
// Before:
const filtered = AGENCIES.filter(a => ...)

// After:
const [agencies, setAgencies] = useState([]);
useEffect(() => {
  sb.from('agencies').select('*').then(({ data }) => setAgencies(data || []));
}, []);
const filtered = agencies.filter(a => ...)
```

**Writing data** — replace `Object.assign` / `.push` in `RecordForm` (~lines 2223–2228):
```js
// Before:
const idx = AGENCIES.findIndex(a => a.id === data.id);
if (idx > -1) Object.assign(AGENCIES[idx], data);
else AGENCIES.push(data);

// After:
if (data.id) {
  await sb.from('agencies').update(data).eq('id', data.id);
} else {
  await sb.from('agencies').insert(data);
}
```

Once Agencies works, repeat the same pattern for Contacts, Datasets, Communications, Requests, Tasks, Notes.

---

### Step 6: Replace Hardcoded User (30 min)
The app hardcodes `"Sarah Chen"` as the current user everywhere. Replace with Supabase Auth:
1. In Supabase dashboard → **Authentication → Users** → invite your team members
2. Add a login screen to the app (simple email/password form)
3. Replace `"Sarah Chen"` with `session.user.email` or `session.user.user_metadata.full_name`

---

### Step 7: Deploy to Vercel (30 min)
1. Put `DataTrack_v11plus.html` in a GitHub repo
2. Go to [vercel.com](https://vercel.com) → New Project → import the GitHub repo
3. No build config needed — Vercel will serve the HTML file directly
4. Set environment variables for Supabase URL and anon key (optional but cleaner than hardcoding)
5. Share the Vercel URL with your team

---

## Recommended Order

| Step | Time | What you get |
|------|------|-------------|
| 1–2 | ~1 hr | Database is live with real schema |
| 3 | ~30 min | Seed data loaded |
| 4 | ~10 min | App can talk to Supabase |
| 5 (Agencies only) | ~2 hrs | First module reads/writes real data |
| 5 (all modules) | ~8–12 hrs | Full app on real data |
| 6 | ~30 min | Real login instead of hardcoded user |
| 7 | ~30 min | Live URL, shareable with team |

**First milestone:** End of Step 5 (Agencies only) — you'll have proof the integration works before touching the other 6 modules.

---

## Verification
- After Step 2: Check Supabase Table Editor — all 11 tables appear with correct columns
- After Step 4: Open browser console, run `sb.from('agencies').select('*').then(console.log)` — should return your seeded rows
- After Step 5: Create/edit an agency in the app, reload the page — change should persist
- After Step 7: Open the Vercel URL on a different device — app loads and data is there
