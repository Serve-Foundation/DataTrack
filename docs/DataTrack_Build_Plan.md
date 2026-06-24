# DataTrack — Build Plan
## Volunteer Development · Supabase Backend · Remote Access

---

## Project Summary

DataTrack is a data acquisition CRM for a 501(c)(3) nonprofit that tracks how to obtain real estate public data (code violations, tax liens, tax sales) from California government agencies. A working prototype with 28 React components, 7 modules, and real CA agency data already exists. This plan covers turning that prototype into a live, remotely accessible application.

---

## Tech Stack

| Layer | Service | Monthly Cost | Purpose |
|-------|---------|-------------|---------|
| Database + Auth | Supabase Free Tier | $0 | Postgres database, user authentication, row-level security, real-time subscriptions |
| File Storage | Supabase Storage (free) | $0 | Dataset file uploads (CSV, Excel, PDF) — 1GB free |
| Frontend Hosting | Vercel Hobby Tier | $0 | Deploys from GitHub, HTTPS, custom domain support |
| Outbound Email | Resend Free Tier | $0 | 100 emails/day — CPRA requests, follow-ups, notifications |
| Domain Name | Any registrar | ~$12/year | datatrack.org or similar |
| **Total Year 1** | | **~$1/month ($12/year domain only)** | |

### When to upgrade (Year 2+)

| Trigger | Upgrade | New Cost |
|---------|---------|----------|
| More than 500MB of data | Supabase Pro | $25/mo |
| More than 100 emails/day | Resend Pro | $20/mo |
| Need team features on Vercel | Vercel Pro | $20/mo |
| Need background jobs (automation) | Trigger.dev | $0-20/mo |
| Need uptime monitoring | BetterStack | $10/mo |
| **Fully scaled** | | **$75-95/mo** |

All free tiers are more than sufficient for Year 1 operations with a small team.

---

## What Exists Today (Prototype)

The prototype is a single-file React application that runs in any browser. It includes:

- **7 core modules:** Dashboard, Agencies, Datasets, Communications, Contacts, Requests, Tasks
- **28 React components** with full CRUD forms, inline expand, filtering, sorting
- **Real data:** 35 CA agencies, 45 contacts, 30 datasets seeded from a statewide CSV
- **Complete database schema:** 11 tables with all fields, types, and relationships defined
- **Working UI:** Every button, form, filter, and navigation path is functional in the prototype

What it does NOT have:
- Real database (uses in-memory arrays — data resets on page reload)
- User login (simulates a single user)
- Remote access (runs locally in a browser)
- Email sending (shows templates but doesn't send)
- File uploads (form exists but no storage backend)

---

## What Needs to Be Built

### Phase 1: Foundation (Week 1)
**Goal:** Database is live, app deploys, users can log in.

| Task | Hours | Description |
|------|-------|-------------|
| Create Supabase project | 1 | Set up project, get connection strings |
| Run schema migrations | 3-4 | Create all 11 tables from the defined schema |
| Seed agency data | 2 | Import the 548 CA agencies from the CSV |
| Set up authentication | 4-6 | Supabase Auth with email/password, create initial user accounts |
| Deploy to Vercel | 2 | Connect GitHub repo, configure environment variables, deploy |
| **Phase 1 total** | **12-15 hrs** | |

### Phase 2: Data Layer (Week 2)
**Goal:** All modules read from and write to Supabase instead of mock data.

| Task | Hours | Description |
|------|-------|-------------|
| Replace mock arrays with queries | 12-16 | Each module loads data from Supabase: agencies, contacts, datasets, communications, requests, tasks, notes |
| Wire CRUD operations | 8-12 | RecordForm saves (create + update) go to Supabase instead of Object.assign |
| Add loading states | 3-4 | Spinner/skeleton UI while data loads |
| Error handling | 3-4 | Show error messages when queries fail instead of blank pages |
| **Phase 2 total** | **26-36 hrs** | |

### Phase 3: Security + Roles (Week 3)
**Goal:** Users only see what their role permits.

| Task | Hours | Description |
|------|-------|-------------|
| Row-level security policies | 4-6 | Admin sees all, Specialist sees their assigned records, Analyst sees datasets + reviews, Viewer is read-only |
| Role assignment | 2-3 | Admin can assign roles to users via Settings page |
| Session management | 2-3 | Login/logout, session persistence, redirect to login when not authenticated |
| **Phase 3 total** | **8-12 hrs** | |

### Phase 4: Email + Files (Week 4)
**Goal:** Team can send emails and upload data files.

| Task | Hours | Description |
|------|-------|-------------|
| Resend integration | 4-6 | Outbound email from CommForm using templates with variable substitution |
| File upload on datasets | 4-6 | Upload CSV/Excel/PDF to Supabase Storage, link to dataset record |
| CSV import tool | 4-6 | Import agency/contact data from spreadsheets |
| **Phase 4 total** | **12-18 hrs** | |

### Phase 5: Polish + Launch (Week 5)
**Goal:** Stable, usable, ready for daily operations.

| Task | Hours | Description |
|------|-------|-------------|
| URL-based routing | 3-4 | Browser back/forward works, bookmarkable pages, eliminates blank page risk |
| Error boundaries | 2-3 | Component crashes show recovery message, not blank page |
| Testing | 6-8 | Walk through every workflow end-to-end, fix edge cases |
| Documentation | 3-4 | User guide for the team: how to log in, create records, file requests |
| **Phase 5 total** | **14-19 hrs** | |

### Total Build Effort

| Phase | Hours | Calendar |
|-------|-------|----------|
| 1. Foundation | 12-15 | Week 1 |
| 2. Data Layer | 26-36 | Week 2 |
| 3. Security | 8-12 | Week 3 |
| 4. Email + Files | 12-18 | Week 4 |
| 5. Polish | 14-19 | Week 5 |
| **Total** | **72-100 hrs** | **5 weeks** |

---

## Volunteer Team Structure

### Minimum: 1 volunteer developer
- Works 15-20 hours/week
- Timeline: **5-7 weeks** to functional product
- Must know: React, basic SQL, willing to learn Supabase
- This person handles everything sequentially

### Recommended: 2 volunteer developers
- **Volunteer A (Frontend):** Wires React components to Supabase queries, handles UI (40-50 hrs)
- **Volunteer B (Backend):** Schema migrations, auth, RLS policies, email integration, file storage (32-50 hrs)
- Working in parallel: **3-4 weeks** to functional product
- Reduces timeline by almost half

### Optional: 3rd volunteer (Data + Testing)
- Seeds database with full CA agency data from CSV
- Tests every workflow, reports bugs
- Writes user documentation
- No coding experience required — can use Supabase dashboard directly

---

## What Volunteers Need to Know

### Required skills (at least one volunteer must have):
- React (the entire frontend is React)
- Basic SQL or willingness to learn Supabase's dashboard
- Git (to manage code and deploy via Vercel)
- Command line basics

### Helpful but not required:
- Next.js (the recommended framework wrapping React)
- Tailwind CSS (for cleaning up inline styles eventually)
- Postgres (Supabase is Postgres under the hood)

### What they DON'T need to figure out:
- Database design — **fully defined** in the handoff document
- UI design — **fully built** in the prototype
- Workflow logic — **fully implemented** in the JSX
- What fields go on what forms — **every field is specified**

The prototype did the hard work. The volunteers are implementing, not designing.

---

## Files to Give Volunteers

| File | What It Is |
|------|-----------|
| **DataTrack_Acquire_Handoff.md** | Complete project spec: schema, features, migration steps |
| **DataTrack_v11plus.jsx** | Source code — every component, form, and workflow |
| **DataTrack_v11plus.html** | Working demo — open in browser, click through everything |

### Suggested first instruction to volunteers:

> *"Open DataTrack_v11plus.html in your browser and click through every page. That's what we're building. Read DataTrack_Acquire_Handoff.md for the database schema and technical details. Your job is to make this work with real data on Supabase instead of the mock data baked into the file. Start with Phase 1: create the Supabase project, run the schema, and deploy to Vercel."*

---

## Accounts to Create Before Starting

| Service | URL | Who Creates It | Notes |
|---------|-----|----------------|-------|
| Supabase | supabase.com | Project lead | Use the nonprofit's email. Free tier. |
| Vercel | vercel.com | Project lead | Connect to GitHub. Free hobby tier. |
| GitHub | github.com | Project lead | Private repo for the codebase. Free. |
| Resend | resend.com | Project lead | For outbound email. Free tier. |
| Domain | any registrar | Project lead | Optional but recommended. ~$12/year. |

Share credentials with volunteers via a password manager or secure channel — not email or Slack messages.

---

## Data Volume Projection

| Entity | Year 1 | Year 3 |
|--------|--------|--------|
| Agencies | 548 | 600 |
| Contacts | 1,500 | 3,000 |
| Datasets | 2,500 | 5,000 |
| Communications | 5,000 | 20,000 |
| Requests | 2,000 | 8,000 |
| Tasks | 3,000 | 12,000 |
| Notes | 2,000 | 10,000 |
| **Total rows** | **~16,500** | **~58,000** |
| **Estimated DB size** | **~10 MB** | **~50 MB** |

Supabase free tier allows 500MB. You won't need to upgrade for data volume alone for several years.

---

## Why Not Google Sheets

Sheets was considered and rejected for these reasons:

1. **No relational lookups.** "Find all communications for Agency X that have open follow-ups linked to Request Y" is one SQL query but impossible in Sheets without custom scripting.
2. **No concurrent multi-user editing** with conflict resolution. Two people editing the same agency record in Sheets = data loss.
3. **No role-based access.** You can't make a Viewer read-only on specific tabs while a Specialist can edit.
4. **Performance degrades above 10,000 rows.** You'll hit that in Year 1 on communications alone.
5. **You'd rebuild it anyway.** A Sheets-backed app takes nearly the same development effort as Supabase — but you throw it all away when you migrate.

Supabase free tier costs the same as Sheets ($0) and doesn't have these limitations.

---

## Monthly Operating Costs Summary

| Phase | Monthly Cost |
|-------|-------------|
| **Year 1 (free tiers)** | **$0-1/mo** (domain only) |
| **Year 2+ (if needed)** | **$25-95/mo** (scaled tiers) |
| **Development cost** | **$0** (volunteer-built) |
| **Annual hosting budget** | **$12-1,140/year** |

---

## Timeline Summary

| Week | Milestone | Result |
|------|-----------|--------|
| 1 | Database + Auth + Deploy | Team can log in, empty app is live |
| 2 | Data layer wired | All 7 modules read/write real data |
| 3 | Roles + Security | Users see only what their role allows |
| 4 | Email + File uploads | Team can send CPRA requests and upload data files |
| 5 | Testing + Launch | Stable product, ready for daily use |

**First usable version: End of Week 2.**
**Production-ready: End of Week 5.**
