# DataTrack — Data Acquisition CRM Handoff
## Acquire-Only Version (v11+)

---

## What This Is

DataTrack is an internal data acquisition CRM for a 501(c)(3) nonprofit that tracks how to obtain real estate public data (code violations, tax liens, tax sales) from California government agencies. It manages the full lifecycle: identifying data sources, filing requests, tracking communications, reviewing received data, and assigning follow-up tasks.

This is a **single-file React prototype** with mock data from real CA agencies. It's ready to demo and ready for volunteers to wire up to a Supabase backend.

---

## Files

| File | Purpose |
|------|---------|
| **DataTrack_v11plus.html** | Working prototype — open in any browser |
| **DataTrack_v11plus.jsx** | Source JSX (pre-compiled via Babel CLI) |
| **DataTrack_v11plus_dev.jsx** | Dev version with ES module imports |

---

## Architecture Decisions

| Service | Cost | Purpose |
|---------|------|---------|
| Supabase Pro | $25/mo | Database, auth, storage |
| Vercel Pro | $20/mo | Hosting |
| Resend | $20/mo | Outbound email |
| Postmark | $10/mo | Inbound email |
| Trigger.dev | $0-20/mo | Background jobs |
| BetterStack | $10/mo | Monitoring |
| **Total** | **~$100-120/mo** | From $150/mo budget |

### Visual Identity
- **Font:** Plus Jakarta Sans
- **Primary:** Warm teal (#0F766E)
- **Background:** Cream (#F8F6F3)
- **Sidebar:** Dark navy (#1A1A2E)

---

## Pages (7 + Settings)

### Sidebar Navigation
```
Dashboard
Agencies
Datasets
Communications
Contacts
Requests
Tasks
─────────
Settings
```

### Page Details

**Dashboard** — Clickable metric cards for all entities (agencies, datasets, contacts, requests, tasks). 3 role views (Admin/Specialist/Analyst). Pipeline charts by dataset status and category. Overdue task alerts. Recent activity feed. Every metric is clickable → navigates to filtered list.

**Agencies** — 35 CA agencies with search, county/type filters, sort (Name/County/Most Contacts), pagination. Click any row → AgencyDetail page with 4 tabs:
- Contacts tab: clickable contact cards → open ContactDetail. Multi-value emails/phones displayed. Email button per contact.
- Datasets tab: linked datasets with status badges
- Communications tab: logged interactions
- Notes tab: NotesPanel (timestamped, append-only)
- Header buttons: Edit Agency, + Task, Log Communication

**Datasets** — 30 datasets with pipeline summary bar, status/method/category/frequency filters. Inline expand with agency link. Data Review panel (analyst feedback with preset tags + custom notes). Add Dataset button creates new records.

**Communications** — Logged interactions with **inline chevron expand** (same pattern as Requests/Tasks). Expanded view shows: 3-column detail grid (Details, Linked Records, Follow-up), full body text, edit history audit trail. Buttons: Edit Communication, + Task, Log Communication, View Agency. CommDetail modal for editing with field-level change tracking.

**Contacts** — 45 contacts in table view with department/county filters. Click any row → **ContactDetail page** with 3 tabs (Details, Communications, Notes). Header shows all emails/phones with labels and primary stars. Buttons: Log Communication, + Task, Edit Contact. Agency link is clickable → AgencyDetail.

**Requests** — 20 acquisition requests (CPRA, API access, manual) with **inline chevron expand**. Status pipeline pills. Type/assignee/sort filters (Newest First/Oldest First). Expanded view: 3-column detail grid, sent-to contact (clickable), NotesPanel, communication thread, edit history. Buttons: Edit Request, + Task, View Agency.

**Tasks** — Unified task + follow-up system with **inline chevron expand**. Status pills (Open/In Progress/Blocked/Done), type pills (Follow-up/Data Review/Requested Data/Clarification/General), assignee filter. Each card shows: title, type/priority badges, assignee, linked agency/contact, due date countdown. Expanded view: 3-column detail (Details, Assignment, Linked Records), note history timeline, assignment history. Buttons: Edit Task, Follow-Up Task, ✓ Complete, ⏰ Snooze (3d/5d/10d/2w/30d).

**Settings** — 3 tabs: Users & Roles (admin/specialist/analyst/viewer), Email Templates (4 templates), System Settings (shared email, follow-up defaults, entity counts).

---

## Database Schema

### users
id, full_name, email, display_name, role (admin/specialist/analyst/viewer), is_active, last_active, created_at

### agencies
id, name, agency_type (city/county/special_district), state, jurisdiction, website, emails (JSONB: [{value, label, is_primary}]), phones (JSONB: [{value, label, is_primary}]), notes, created_at

### contacts
id, agency_id (FK agencies), first_name, last_name, title, department, emails (JSONB array), phones (JSONB array), is_primary, is_active, created_at

### datasets
id, agency_id (FK agencies), name, data_category (code_violations/tax_liens/tax_sales/permits/assessments/foreclosures/other), acquisition_status (identified/contacted/negotiating/acquired/automated/active/discontinued), acquisition_method (api/foia/portal/scraping/direct_purchase/manual_request/unknown), delivery_format, delivery_method, refresh_frequency, cost_amount, cost_type, turnaround_days, automation_feasible, portal_url, api_endpoint, acquisition_playbook, notes, created_at

### communications
id, agency_id (FK agencies), contact_id (FK contacts), dataset_id (FK datasets), request_id (FK requests), channel (email/phone/foia/portal), direction (inbound/outbound), subject, body, user_name, outcome, follow_up_date, follow_up_status, edit_log (JSONB: [{by, date, fields}]), created_at

### requests
id, agency_id (FK agencies), dataset_id (FK datasets), title, request_type (cpra/foia/api_access/direct_purchase/manual_request), status (draft/submitted/awaiting_response/in_progress/received/closed/rejected), assigned_to, sent_to_contact (FK contacts), reference_number, submitted_date, expected_response_date, cost_quoted, cost_paid, edit_log (JSONB array), notes, created_at

### tasks
id, title, description, task_type (follow_up/data_review/requested_data/clarification/general), status (open/in_progress/completed/blocked/cancelled), priority (low/normal/high/urgent), assigned_by, assigned_to, due_date, agency_id (FK), contact_id (FK), dataset_id (FK), request_id (FK), note_history (JSONB: [{text, by, date}]), assignment_history (JSONB: [{from, to, date, by}]), completed_at, created_at

### notes (polymorphic)
id, entity_type (agency/contact/task/request), entity_id, content, note_type (general/relationship/personal/internal/follow_up), created_by, is_pinned, created_at

### data_reviews
id, dataset_id (FK), reviewed_by, review_status (pending/approved/rejected/needs_revision/needs_clarification), feedback_presets (text[]), custom_notes, file_name, created_at

### feedback_presets
id, code, label, category (format/structure/content/quality), is_active, sort_order, created_by

### email_templates
id, name, channel, subject, body, is_active

---

## Key Features Built

### Multi-Value Emails & Phones
Stored as JSONB arrays: `[{value: "jane@gov.org", label: "work", is_primary: true}]`. The `MultiField` component renders +/- buttons for adding/removing entries with label dropdowns and primary radio buttons.

### Record CRUD with Persistence
`RecordForm` handles Agency, Contact, Dataset, and Request creation/editing. Saves via `Object.assign(ARRAY[idx], updated)` for edits and `ARRAY.push(newRecord)` for creates. In production, replace with Supabase upserts.

### Task Creation from Any Module
"+ Task" button on Agencies, Contacts, Requests, and Communications. Uses `type: "task_create"` which the App component routes to TaskForm instead of RecordForm, pre-filling linked record IDs.

### Timestamped Notes
`NotesPanel` (polymorphic) available on Agencies, Contacts, Requests, and Tasks. Each note has content, created_at, created_by. Append-only. Tasks also have `note_history` timeline in the edit form.

### Unified Tasks (Follow-ups merged)
Communication follow-ups auto-convert to tasks with `task_type: "follow_up"`. One queue. Snooze (3d/5d/10d/2w/30d) and Complete buttons use `tick` counter state for reliable re-render.

### Inline Expand Pattern
Tasks, Communications, and Requests use the same chevron-arrow expand behavior with 3-column detail grids. Agencies and Contacts use full-page detail views with tabs.

### Communication Logging
CommForm supports: channel selection (email/phone/FOIA/portal), direction, template selection (filtered by channel), outcome, follow-up date with presets. Creates actual timestamped records.

### Analyst Data Review
DataReviewPanel on dataset detail: preset feedback tags (12 presets across format/structure/content/quality categories), custom notes, review status (approved/rejected/needs_revision/needs_clarification).

### Edit Audit Logging
Communications and Requests track `edit_log`: `[{by, date, fields_changed}]`. Tasks track `assignment_history`: `[{from, to, date, by}]`.

---

## Mock Data

| Entity | Count | Source |
|--------|-------|--------|
| Agencies | 35 | Real CA agencies (trimmed from 548) |
| Contacts | 45 | From CSV: code enforcement, building, legal |
| Datasets | 30 | Realistic categories and statuses |
| Communications | 10 | Sample interactions |
| Requests | 20 | CPRA, API access, manual requests |
| Tasks | 20+ | Including auto-generated follow-ups |
| Notes | 25 | Across agencies and contacts |
| Data Reviews | 8 | Analyst review samples |
| Users | 4 | Admin, Analyst, Specialist, Viewer |
| Email Templates | 4 | CPRA, follow-up, API access, phone script |
| Feedback Presets | 12 | Format/structure/content/quality |

The agency and contact data was seeded from `ca_building_code_legal_contacts_statewide_best_effort.csv` (548 CA agencies across 58 counties).

---

## Version History (How We Got Here)

| Version | What Changed |
|---------|-------------|
| v1-v2 | Agency list + detail with real CA data |
| v3-v4 | Dataset list, communication form, comm log |
| v5 | Follow-up queue, contact directory |
| v6 | Clickable dashboard, notes panel, filter navigation |
| v7 | Fixed blank page (pre-compiled JSX), trimmed to 35 agencies |
| v8 | Requests module + visual reskin (blue → teal) |
| v9 | Expanded comm form (outcomes, templates), role-based dashboard |
| v10 | Admin settings (users, email templates, system config) |
| v11 | Record forms (CRUD), tasks, data reviews with analyst presets |
| **v11+** | **Current: v11 base + best of v12-v18 improvements, Acquire-only** |

### What v11+ adds over original v11:
- Multi-value emails/phones (MultiField component)
- ContactDetail page (full record with tabs)
- Save persistence (Object.assign to in-memory arrays)
- Inline expand on Tasks and Communications (matching Requests)
- Working Snooze and Complete on tasks
- Task note history timeline
- Task creation from any module (+ Task button everywhere)
- CommForm actually saves records with timestamps
- Edit audit logging (edit_log, assignment_history)
- Follow-Up Task button
- 10-day follow-up preset
- Blank page prevention (navTo clears all state)
- Dataset Add button wired
- Request sort by date (Newest/Oldest)
- Clean sort dropdown labels
- Defensive rendering guards

---

## How to Continue

### To start a new Claude chat:
Upload the three files and say:

> "I'm continuing development on DataTrack, a data acquisition CRM for a 501(c)(3) nonprofit. The attached handoff doc has the full spec and schema. The JSX file is the working prototype (v11+). Please review both and continue. My priorities are: [list yours]."

### Suggested priorities:
1. Wire up Supabase (schema is defined above)
2. Add real authentication (replace hardcoded "Sarah Chen")
3. Add URL hash routing (eliminates blank page risk entirely)
4. Add error boundaries
5. Deploy to Vercel

### To wire Supabase:
1. Create project, run schema migrations
2. Replace each `const AGENCIES = [...]` with `const { data: AGENCIES } = await supabase.from('agencies').select('*')`
3. Replace each `Object.assign(ARRAY[idx], data)` with `await supabase.from('table').update(data).eq('id', data.id)`
4. Replace each `ARRAY.push(data)` with `await supabase.from('table').insert(data)`
5. Add Supabase Auth, replace hardcoded user with session user
6. Add RLS policies per role

### Technical notes:
- Pre-compiled via Babel CLI (no in-browser compilation)
- Font: Plus Jakarta Sans loaded from Google Fonts
- React 18.3.1 from CDN (production build)
- All state management is React useState/useMemo — no external state library
- File is ~350KB JSX → ~430KB compiled → ~430KB HTML
