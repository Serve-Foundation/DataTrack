# DataTrack User Manual

## Purpose

DataTrack is a shared CRM for managing public-sector real estate data acquisition work. Use it to track agencies, contacts, datasets, public records requests, communications, tasks, and analyst reviews in one place.

The live app is here:

```text
https://serve-foundation.github.io/DataTrack/
```

## Who Uses DataTrack

| Role | Typical use |
| --- | --- |
| Admin | Manage users, settings, records, and team oversight. |
| Specialist | Manage agencies, contacts, communications, requests, and follow-up tasks. |
| Analyst | Review received datasets and record feedback. |
| Viewer | Read records and understand acquisition status. |

## Sign In

1. Open the live app URL.
2. Enter your email and password.
3. Click **Sign in**.

If you forgot your password:

1. Enter your email.
2. Click **Forgot password?**
3. Check your email for the reset link.
4. Enter a new password. Passwords must be at least 8 characters.

## Create An Account

1. Open the app.
2. Click **Create an account**.
3. Enter your full name, email, password, and requested role.
4. Click **Create account**.
5. Check your email and confirm the account if Supabase sends a confirmation email.
6. Return to DataTrack and sign in.

If your account does not appear in **Settings -> Users & Roles**, ask an admin to confirm that the account gateway SQL has been run in Supabase.

## Main Navigation

Use the left sidebar to move between these areas:

| Area | Use it for |
| --- | --- |
| Dashboard | See team totals, open requests, open tasks, pipeline status, overdue work, and recent activity. |
| Agencies | Track government agencies and their linked contacts, datasets, communications, and notes. |
| Datasets | Track target datasets, acquisition status, delivery method, cost, frequency, and analyst reviews. |
| Communications | Log emails, calls, CPRA/FOIA messages, portal activity, outcomes, and follow-up dates. |
| Contacts | Track agency staff, departments, emails, phones, and communication history. |
| Requests | Track public records requests, API access requests, direct purchase requests, and manual requests. |
| Tasks | Manage follow-ups, data reviews, clarification requests, blocked items, and assignments. |
| Settings | Manage users, roles, templates, and system settings. |

## Everyday Workflows

### Check Work Status

1. Go to **Dashboard**.
2. Review open requests, open tasks, overdue tasks, and recent activity.
3. Click a metric card to jump to the matching filtered list.

### Add Or Update An Agency

1. Go to **Agencies**.
2. Search first to avoid duplicates.
3. Click **Add Agency** or open an existing agency and click **Edit Agency**.
4. Enter the agency name, type, state, jurisdiction, website, phone numbers, email addresses, and notes.
5. Click **Create** or **Save Changes**.

Use clear agency names, such as `Los Angeles County Assessor` instead of short abbreviations.

### Add A Contact

1. Go to **Contacts**.
2. Click **Add Contact**.
3. Select the agency.
4. Enter the person's name, title, department, email addresses, and phone numbers.
5. Mark the person as **Primary contact** if they are the best first point of contact.
6. Click **Create**.

### Add Or Update A Dataset

1. Go to **Datasets**.
2. Click **Add Dataset** or edit an existing dataset.
3. Select the owning agency.
4. Enter the dataset name, category, status, method, frequency, cost, turnaround time, and acquisition playbook.
5. Click **Create** or **Save Changes**.

Keep the acquisition playbook practical. Write the steps another person would need to repeat the process.

### Log A Communication

1. Go to **Communications**, or open an agency/contact/request and use **Log Communication**.
2. Select the agency, contact, dataset, or request when applicable.
3. Choose the channel, such as email, phone, FOIA/CPRA, or portal.
4. Add the subject, body, outcome, and follow-up date if needed.
5. Save the communication.

Always log important interactions, especially agency replies, request submissions, fee quotes, delays, and follow-up commitments.

### Track A Request

1. Go to **Requests**.
2. Click **Add Request**.
3. Select the agency and dataset if known.
4. Choose the request type and status.
5. Assign the request owner.
6. Add the sent-to contact, reference number, expected response date, costs, and notes.
7. Click **Create**.

Update request status as work moves forward:

| Status | Meaning |
| --- | --- |
| Draft | Request is being prepared. |
| Submitted | Request has been sent. |
| Awaiting Response | Waiting on the agency. |
| In Progress | Agency is working on it or staff are actively processing it. |
| Received | Data or response was received. |
| Closed | Work is complete. |
| Rejected | Agency denied or cannot fulfill the request. |

### Create And Manage Tasks

1. Go to **Tasks**, or use **+ Task** from another record.
2. Add a clear title.
3. Choose the task type, priority, status, assignee, and due date.
4. Link the task to an agency, contact, dataset, or request when useful.
5. Add notes that explain what needs to happen next.
6. Click **Create Task**.

Use task statuses consistently:

| Status | Use when |
| --- | --- |
| Open | Work has not started yet. |
| In Progress | Someone is actively working on it. |
| Blocked | Work cannot continue until something changes. |
| Completed | Work is done. |
| Cancelled | Work is no longer needed. |

### Review A Dataset

1. Go to **Datasets**.
2. Open the dataset.
3. In **Data Reviews**, click **+ New Review**.
4. Choose the review status.
5. Select feedback presets if the dataset needs revision or clarification.
6. Add clear custom notes.
7. Click **Submit Review**.

Use reviews to explain whether the dataset is usable and what must be fixed before it can be used.

### Upload Files

All upload buttons in DataTrack are active and can be used when a workflow asks for a file. Use upload buttons to attach the relevant source file, received dataset, supporting document, or review material to the record you are working on.

Before uploading, use a clear file name that identifies the agency, dataset, and date when possible.

### Add Notes

Use notes to preserve context that does not fit cleanly in a form field.

Good notes include:

- Who said what.
- Why a request is blocked.
- Which portal page or contact method worked.
- Important deadlines.
- Relationship context with an agency.

Avoid vague notes like `follow up later`. Write the next action and date when possible.

## Data Entry Standards

- Search before creating a new agency, contact, dataset, or request.
- Use full names for agencies and people.
- Link records whenever possible.
- Keep task titles action-oriented, such as `Follow up on CPRA fee quote`.
- Keep request notes factual.
- Do not store passwords, private credentials, or sensitive personal information in notes.
- Close or complete records when the work is finished.

## Quick Reference

| Need | Go to |
| --- | --- |
| See what is overdue | Dashboard or Tasks |
| Find an agency | Agencies |
| Find a person at an agency | Contacts |
| See what data we are trying to acquire | Datasets |
| Record an email or phone call | Communications |
| Track a CPRA/FOIA/API request | Requests |
| Assign follow-up work | Tasks |
| Review data quality | Dataset detail -> Data Reviews |
| Upload a file | Use the upload button on the relevant record |
| Manage users or roles | Settings |
