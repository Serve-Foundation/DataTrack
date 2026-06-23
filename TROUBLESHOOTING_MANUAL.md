# DataTrack Troubleshooting Manual

## Start Here

Use this order when something is not working:

1. Refresh the page.
2. Sign out and sign back in.
3. Confirm you are using the live URL:

```text
https://serve-foundation.github.io/DataTrack/
```

4. Check whether other users have the same issue.
5. If it still fails, collect the exact error message, the page name, the record name, and what you clicked before the problem happened.

## Common User Issues

### I Cannot Sign In

Check:

- Email address is typed correctly.
- Password is correct.
- The account email has been confirmed if a confirmation email was sent.
- The app is opened from the live URL, not an old local file.

Try:

1. Click **Forgot password?**
2. Reset your password from the email link.
3. Sign in again.

If that does not work, ask an admin to check Supabase Authentication for your user account.

### I Created An Account But Cannot Use The App

Check:

- You confirmed your email if Supabase sent a confirmation email.
- You are signing in with the same email you used to create the account.
- Your account appears in **Settings -> Users & Roles**.

Admin check:

- Confirm `simple-create-account-gateway.sql` has been run in the Supabase SQL Editor.
- Confirm the user exists in both Supabase Authentication and `public.users`.
- Confirm the user has a valid role: `admin`, `specialist`, `analyst`, or `viewer`.
- Confirm `is_active` is true if the app uses that field for access.

### Password Reset Email Did Not Arrive

Check:

- Spam or junk folder.
- Email address spelling.
- Organization email filters.

Technical check:

- In Supabase, confirm password recovery emails are enabled.
- In Supabase Auth URL settings, confirm the deployed app URL is allowed and preferably set as the Site URL:

```text
https://serve-foundation.github.io/DataTrack/
```

For local testing, also allow:

```text
http://localhost:5174/
```

If the email opens `localhost:3000`, Supabase is using an old Site URL or rejecting the requested redirect URL. Update **Supabase Dashboard -> Authentication -> URL Configuration**:

- Site URL: `https://serve-foundation.github.io/DataTrack/`
- Redirect URLs: include `https://serve-foundation.github.io/DataTrack/`

Then send a new password reset email. Old reset links will still point to the old URL.

### Page Says "Loading Supabase Data..." For Too Long

Try:

1. Refresh the page.
2. Sign out and sign back in.
3. Try another browser or private window.

Technical check:

- Confirm the hardcoded `SUPABASE_URL` and `SUPABASE_ANON_KEY` in the app point to the active Supabase project.
- Confirm the Supabase project is not paused.
- Confirm the browser can reach `*.supabase.co`.
- Open browser developer tools and check the Console and Network tabs for Supabase errors.

### Page Says "Supabase Load Failed"

Common causes:

- Supabase project URL is wrong.
- Anon key is wrong or expired.
- Required tables are missing.
- Row Level Security policy blocks the current user.
- Browser/network access to Supabase is blocked.

Technical check:

1. Open Supabase Dashboard.
2. Go to **Project Settings -> API**.
3. Confirm the Project URL and anon public key match the app constants.
4. Confirm these tables exist:

```text
users
agencies
contacts
datasets
communications
requests
tasks
notes
data_reviews
feedback_presets
email_templates
```

5. Check the failing request in browser developer tools.

### A Record Will Not Save

Check:

- Required fields are filled in.
- Linked records exist. For example, a contact must be linked to an agency.
- You are not creating an exact duplicate agency with the same jurisdiction.
- You are signed in.

Technical check:

- Check the browser Console for the exact Supabase error.
- Check Supabase table constraints and foreign keys.
- Check Row Level Security policies for insert/update permission.
- Confirm JSON fields such as `emails`, `phones`, `edit_log`, `note_history`, and `assignment_history` are valid JSON-compatible values.

### I Cannot Delete An Agency Or Request

Likely cause:

- The record has linked contacts, datasets, communications, tasks, or requests.
- Supabase foreign keys may block deletion until linked records are removed or reassigned.

Fix:

1. Open the record.
2. Review linked records.
3. Reassign or delete dependent records first.
4. Try deleting again.

Technical option:

- Decide whether the database should use restricted deletes, cascading deletes, or soft deletes. Do not change this casually because it affects audit history.

### A Contact Or Dataset Dropdown Is Empty

Likely cause:

- The agency has not been selected yet.
- The selected agency has no linked contacts or datasets.

Fix:

1. Select the agency first.
2. Confirm the contact or dataset exists under that agency.
3. Create the missing contact or dataset if needed.

### A Task Does Not Show Up

Check:

- Task status filter. The Tasks page may default to open work.
- Assignee filter.
- Search text.
- Due date and status.

Try:

1. Clear search.
2. Set status filter to show all or the expected status.
3. Check whether the task is linked under the related agency, contact, dataset, or request.

### A Review Does Not Appear

Check:

- You submitted the review from the correct dataset.
- The page refreshed after the review was submitted.
- Supabase did not show a save error.

Technical check:

- Confirm the review row exists in `data_reviews`.
- Confirm `dataset_id` matches the dataset being viewed.
- Confirm `feedback_presets` is stored as an array.

### Data Looks Old Or Different For Two Users

Try:

1. Refresh both browsers.
2. Sign out and sign back in.
3. Confirm both users are using the same live URL.

Technical check:

- Confirm both users are pointed at the same Supabase project.
- Confirm the deployment was updated after code changes.
- Confirm local testing files are not being confused with the live GitHub Pages version.

## Technical Troubleshooting

### Local App Test

From the repo folder:

```bash
python3 -m http.server 5174
```

Open:

```text
http://localhost:5174/
```

If port `5174` is busy:

```bash
python3 -m http.server 5175
```

Then open:

```text
http://localhost:5175/
```

### Files To Check

| File | Use |
| --- | --- |
| `index.html` | GitHub Pages entry point. |
| `DataTrack_v11plus.html` | Runnable app file. |
| `DataTrack_v11plus.jsx` | Main source file. |
| `DataTrack_v11plus_dev.jsx` | Development ES module version. |
| `simple-create-account-gateway.sql` | Supabase trigger for new account profile rows. |
| `DataTrack_Acquire_Handoff.md` | Schema and technical handoff reference. |

### Supabase Configuration Checklist

Confirm:

- Project is active.
- Project URL is correct.
- Anon public key is correct.
- Auth email/password sign-in is enabled.
- Redirect URLs include the deployed app and local test URL.
- Required tables exist.
- `simple-create-account-gateway.sql` has been run if self-service account creation is enabled.
- Row Level Security policies allow the intended read/write actions.
- Seed/reference tables have data, especially `users`, `email_templates`, and `feedback_presets`.

### Browser Checks

Open developer tools and check:

- **Console** for JavaScript or Supabase errors.
- **Network** for failed requests.
- HTTP status codes:
  - `401` or `403`: auth or permission issue.
  - `404`: wrong URL or missing table/function.
  - `409`: duplicate or constraint conflict.
  - `500`: backend or database error.

### GitHub Pages Checks

If the live app is not updating:

1. Confirm changes were committed and pushed to `main`.
2. Confirm GitHub Pages is serving from the expected branch/folder.
3. Wait a few minutes for Pages to deploy.
4. Hard refresh the browser.

### Known Product Constraints

- The app is a static React app served from HTML files.
- There is no package manager or framework build server in the current repo.
- Some older planning docs describe the original prototype stage. The README is the best current high-level reference.
- Some record history labels may still use default names in the app source until user attribution is fully wired through every workflow.
- File upload and outbound email sending are not fully covered by the current static app workflow unless separately implemented in Supabase or another service.

## Escalation Template

When asking for help, include:

```text
User:
Role:
Page:
Record name or ID:
What I clicked:
Expected result:
Actual result:
Error message:
Browser:
Time it happened:
Does it happen for other users? yes/no/unknown
Screenshot attached? yes/no
```

Clear reports are faster to fix than broad reports like "DataTrack is broken."
