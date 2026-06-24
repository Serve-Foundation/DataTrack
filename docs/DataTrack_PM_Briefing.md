# DataTrack CRM — Project Manager Briefing
## Build Plan for Volunteer Development Team

---

## Executive Summary

DataTrack is a data acquisition CRM for our 501(c)(3) that tracks how we obtain public real estate data (code violations, tax liens, tax sales) from California government agencies. A fully designed, clickable prototype already exists — every page, every form, every button, every database table is defined. We need a volunteer team to turn this prototype into a live, remotely accessible application.

**Bottom line:** 5 volunteers, 8-10 working days, $0 development cost, $0-1/month to run.

---

## What Already Exists

A working browser-based prototype containing:
- 7 core modules (Dashboard, Agencies, Datasets, Communications, Contacts, Requests, Tasks) plus Settings
- 28 React components with full CRUD forms, inline expand, filtering, sorting, and navigation
- Real data: 35 CA agencies (from a 548-agency statewide CSV), 45 contacts, 30 datasets
- Complete database schema: 11 tables with every field, type, and relationship specified
- Working UI: every workflow is clickable and demonstrable

**To see the prototype:** Open `DataTrack_v11plus.html` in any web browser.

**What the prototype does NOT have** (what we're building):
- A real database (data resets on page reload)
- User login (simulates one user)
- Remote access (runs locally)
- Email sending (shows templates but doesn't send)
- File uploads (forms exist but no storage)

---

## Tech Stack and Costs

| Service | Purpose | Year 1 Cost | Scaled Cost |
|---------|---------|-------------|-------------|
| Supabase Free Tier | Database, authentication, file storage | $0/mo | $25/mo |
| Vercel Hobby Tier | Hosts the web application | $0/mo | $20/mo |
| Resend Free Tier | Sends emails (CPRA requests, follow-ups) | $0/mo | $20/mo |
| GitHub (free) | Code repository | $0/mo | $0/mo |
| Domain name | datatrack.org or similar | ~$1/mo ($12/yr) | ~$1/mo |
| **Total** | | **$0-1/mo** | **$65-95/mo** |

Free tiers are sufficient for Year 1 operations. We upgrade individual services only when we outgrow them.

---

## Team Structure: 5 Volunteers

More than 5 creates coordination overhead. Fewer than 5 extends the timeline unnecessarily. The project has exactly 5 independent work streams.

### Role 1: Backend Lead
**Owns:** Database, authentication, security, email integration
**Skills:** SQL, comfortable with web dashboards. Does NOT need React/frontend skills.
**Hours:** 20

| Task | Hours |
|------|-------|
| Create Supabase project, build all 11 database tables | 4 |
| Import 548 CA agencies + contacts from CSV | 2 |
| Set up user login system (email/password) | 3 |
| Write security policies (who can see/edit what per role) | 5 |
| Configure outbound email service | 4 |
| Set up file storage for dataset uploads | 2 |

**This person starts first.** No one else can begin wiring modules until the database exists. They should complete the schema and seed data on Day 1.

---

### Role 2: Core Modules Developer
**Owns:** Agencies, Contacts, Datasets — the three primary data modules
**Skills:** React, basic database queries
**Hours:** 26

| Task | Hours |
|------|-------|
| Wire Agency list + detail pages to live database | 5 |
| Wire Contact directory + detail pages to live database | 5 |
| Wire Dataset list + data review panel to live database | 5 |
| Wire all create/edit forms for these 3 entity types | 5 |
| Wire timestamped notes system for agencies and contacts | 3 |
| Add loading indicators and error messages | 3 |

**Starts Day 2** (once schema exists). Works completely independently from Role 3 — they touch different files and different database tables.

---

### Role 3: Workflow Modules Developer
**Owns:** Communications, Requests, Tasks — the three activity/workflow modules
**Skills:** React, basic database queries
**Hours:** 24

| Task | Hours |
|------|-------|
| Wire Communications module (log, expand, edit, create) | 6 |
| Wire Requests module (expand, sort, filter, edit) | 5 |
| Wire Tasks module (snooze, complete, notes, expand) | 6 |
| Wire cross-module actions (create task from agency, log comm from contact, etc.) | 4 |
| Add loading indicators and error messages | 3 |

**Starts Day 2.** Works in parallel with Role 2 on completely separate components.

---

### Role 4: Frontend Lead + Deployment
**Owns:** Project structure, navigation, deployment, UI consistency
**Skills:** React, Next.js, Git, Vercel
**Hours:** 23

| Task | Hours |
|------|-------|
| Set up the proper project structure (files, folders, imports) | 4 |
| Add URL-based page navigation (bookmarkable links, browser back/forward) | 4 |
| Add crash recovery (error messages instead of blank screens) | 3 |
| Build the login/logout screen connected to authentication | 4 |
| Deploy to Vercel, configure domain | 2 |
| Clean up visual styling for consistency | 6 |

**Starts Day 1** (project structure doesn't depend on the database). Creates the framework that Roles 2 and 3 build inside.

---

### Role 5: QA, Data Entry, and Documentation
**Owns:** Testing, data quality, user guide
**Skills:** NO coding required. Needs a browser and attention to detail.
**Hours:** 24

| Task | Hours |
|------|-------|
| Test every workflow end-to-end as modules are completed | 8 |
| Verify all 548 agencies imported correctly | 2 |
| Enter additional contact data from source spreadsheets | 4 |
| Write user guide (how to log in, create records, file requests) | 4 |
| Test each user role (log in as Admin, Specialist, Analyst, Viewer) | 3 |
| File bug reports for the other developers to fix | 3 |

**Starts Day 3** (once the first module is testable). Runs through the end of the project.

---

## Timeline: 8-10 Working Days

| Day | Backend Lead | Core Modules | Workflow Modules | Frontend Lead | QA/Docs |
|-----|---|---|---|---|---|
| **1** | Build database + import data | — | — | Project structure + routing | — |
| **2** | Auth + security | Agencies | Communications | Login flow | — |
| **3** | Email service | Contacts | Requests | Error handling | Test Agencies |
| **4** | File storage | Datasets | Tasks | Deploy to Vercel | Test Contacts |
| **5** | Support others | Form saves | Cross-module links | Style cleanup | Test Comms |
| **6** | Security review | Notes system | Loading states | Polish | Test Requests |
| **7** | Final review | Bug fixes | Bug fixes | Bug fixes | Test Tasks |
| **8** | — | — | — | — | Full walkthrough |

**First usable version:** End of Day 4 (modules work, data persists).
**Production-ready:** End of Day 8 (tested, polished, documented).

At 4-5 hours/day per volunteer, that's roughly **1.5-2 calendar weeks.**
At full-time hours, it's **8 business days.**

---

## Comparison: Team Size vs. Completion Time

| Volunteers | Calendar Time | Notes |
|------------|--------------|-------|
| 1 person | 5-7 weeks | Does everything sequentially |
| 2 people | 3-4 weeks | Frontend/backend split |
| 3 people | 2-3 weeks | Core/workflow/backend split |
| **5 people** | **8-10 days** | **Maximum useful parallelism** |
| 6+ people | Still 8-10 days | Extra people wait on each other or create conflicts |

5 is the optimal number because the project has exactly 5 independent work streams. Adding a 6th person doesn't open a 6th stream — it creates two people editing the same files.

---

## Volunteer Skill Requirements

| Role | React | SQL | Git | Coding? |
|------|-------|-----|-----|---------|
| 1. Backend Lead | No | Yes | Basic | Yes — SQL/config only |
| 2. Core Modules | Yes | Basic | Yes | Yes — React + queries |
| 3. Workflow Modules | Yes | Basic | Yes | Yes — React + queries |
| 4. Frontend Lead | Yes | No | Strong | Yes — React + deployment |
| 5. QA / Docs | No | No | No | **No coding needed** |

Roles 2 and 3 need the broadest skills (React + database queries). Role 1 needs no frontend skills. Role 5 needs no technical skills at all.

---

## Coordination Process

**Day 1 Kickoff (1 hour):**
- Everyone opens the HTML prototype together in their browser
- Walk through each module — click every page, every button
- Assign roles
- Role 1 creates the Supabase project live and shares credentials
- Role 4 creates the GitHub repo and gives everyone access

**Daily Standup (15 minutes):**
- What did you finish?
- What are you working on today?
- Are you blocked?

**Communication:** One Slack or Discord channel. No email threads. All questions go in the shared channel so everyone sees answers.

**Code Management:** One GitHub repository. Roles 2 and 3 work on separate files so merge conflicts are rare. Role 4 reviews and merges pull requests.

---

## Accounts Needed (Create Before Day 1)

| Service | URL | Notes |
|---------|-----|-------|
| **Supabase** | supabase.com | Free tier. Use nonprofit's email. |
| **Vercel** | vercel.com | Free hobby tier. Connect to GitHub. |
| **GitHub** | github.com | Free. Private repository. |
| **Resend** | resend.com | Free tier. 100 emails/day. |
| **Domain** | Any registrar | Optional. ~$12/year. |

Create all accounts before the kickoff. Share credentials via password manager — not email or chat messages.

---

## What's in the Handoff Package

The zip file contains everything the team needs to start:

| File | Purpose | Who Uses It |
|------|---------|-------------|
| `DataTrack_v11plus.html` | **Working prototype** — open in browser, click everything | Everyone (Day 1 kickoff) |
| `DataTrack_v11plus.jsx` | **Source code** — 28 components, 3,040 lines | Roles 2, 3, 4 |
| `DataTrack_v11plus_dev.jsx` | **Dev version** — ES module imports for dev tools | Roles 2, 3, 4 |
| `DataTrack_Acquire_Handoff.md` | **Technical spec** — full schema, features, migration steps | Roles 1, 2, 3, 4 |
| `DataTrack_Build_Plan.md` | **Build plan** — phased timeline, costs, infrastructure | Project Manager |
| `DataTrack_PM_Briefing.md` | **This document** — team structure, roles, coordination | Project Manager |

### First instruction to the team:

> *"Open DataTrack_v11plus.html in your browser and spend 20 minutes clicking through every page. That is what we are building. Read the handoff doc for the database schema. Your job is to make this work with a real database so multiple people can use it remotely. The prototype already defines every page, every form, every field, and every workflow. Implement what's defined — do not redesign."*

---

## Budget Summary

| Item | Cost |
|------|------|
| Development | $0 (volunteer-built) |
| Year 1 infrastructure | $0-12 (domain only) |
| Year 2+ infrastructure (if scaled) | $65-95/month |
| **Total to launch** | **$0-12** |

---

## Success Criteria

The project is complete when:

1. ✅ A team member can open a browser, go to our URL, and log in
2. ✅ They can view, create, edit, and search agencies, contacts, and datasets
3. ✅ They can log communications and file CPRA requests
4. ✅ They can create and manage tasks with snooze, complete, and follow-up
5. ✅ Notes are timestamped and preserved (never overwritten)
6. ✅ Each user role sees only what they're permitted to see
7. ✅ Data persists across sessions (not lost on page reload)
8. ✅ The system sends emails for CPRA requests and follow-ups
9. ✅ Dataset files (CSV, Excel, PDF) can be uploaded and retrieved
10. ✅ A non-technical team member can follow the user guide and complete basic workflows
