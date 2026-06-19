# Add Account Creation And Bob Approval Flow

## Summary
Add a self-service “Create account” flow to DataTrack where users enter name, email, password, and requested role. New accounts remain blocked behind a pending approval screen until `bob@servefoundation.org` approves them. Bob can approve/reject pending users inside DataTrack and will also receive an email with direct approve/reject links. Direct email approval grants the requested role; Bob can later change the role in Settings.

## Key Changes
- Add a signup mode to the existing auth screen:
  - Fields: full name, email, password, confirm password, requested role.
  - Allow any email domain to request access.
  - Use Supabase Auth `signUp` for account creation.
  - After signup, create a pending app-user record through a Supabase Edge Function.
- Add approval state to the app-user model:
  - Extend `users` with `requested_role`, `approval_status`, `approval_token`, `approved_by`, `approved_at`, `rejected_at`.
  - Existing `role` remains the effective approved role.
  - Pending users have `approval_status = 'pending'` and `is_active = false`.
  - Approved users have `approval_status = 'approved'`, `is_active = true`, and `role = requested_role` unless changed later.
- Gate app access after sign-in:
  - If no matching approved active `users` row exists for the signed-in email, show an access status screen.
  - Pending users see “Your account is waiting for approval.”
  - Rejected users see “Your access request was not approved.”
  - Approved users enter the app normally.
- Add Bob approval tools:
  - Seed/require `bob@servefoundation.org` as an approved admin user in the `users` table.
  - Add a “Pending Users” view inside Settings → Users & Roles.
  - Bob/admins can approve, reject, or edit the final role from the app.
- Add Supabase Edge Functions:
  - `request-account-access`: creates/updates pending user row and sends Bob an approval email through Resend.
  - `review-account-access`: validates the approval token and processes direct approve/reject links from Bob’s email.
  - Store `RESEND_API_KEY`, `APP_BASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `APPROVER_EMAIL=bob@servefoundation.org` as Supabase function secrets.
- Update deployed static files:
  - Apply auth/signup changes to `DataTrack_v11plus.jsx`.
  - Keep `DataTrack_v11plus.html` and `index.html` in sync for GitHub Pages.
  - Update README with account creation and approval instructions after implementation.

## Test Plan
- Signup:
  - New user can request an account with any email, password, full name, and requested role.
  - Duplicate signup for the same email does not create duplicate pending rows.
  - Password mismatch and missing required fields show clear errors.
- Access gating:
  - Pending user can sign in but sees only the pending approval screen.
  - Rejected user can sign in but sees the rejected access screen.
  - Approved active user can access the app.
- Bob approval:
  - Bob/admin sees pending users in Settings.
  - Bob/admin can approve pending user and optionally change role in-app.
  - Bob/admin can reject pending user.
  - Direct email approve link approves the requested role.
  - Direct email reject link rejects the request.
- Supabase:
  - RLS prevents unauthenticated users from reading or editing all users.
  - Edge Functions can create/update pending users using service-role privileges.
  - Frontend never exposes the service-role key.
- Deployment:
  - GitHub Pages root URL still loads.
  - Signup, sign-in, pending screen, and approved app access work on `https://serve-foundation.github.io/DataTrack/`.

## Assumptions
- Bob’s verifier email is exactly `bob@servefoundation.org`.
- Email delivery will use Supabase Edge Functions plus Resend.
- Direct email approval accepts the user’s requested role; role changes can be made later in DataTrack Settings.
- Any email address may request access.
- Pending users must not access app data until approved.
