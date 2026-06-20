# Simple Create Account Gateway

## Summary

Add a simple create-account option to the DataTrack sign-in screen. Users enter their full name, email, password, confirmed password, and selected role. Supabase Auth creates the login account, and a Supabase trigger creates the matching `public.users` profile row so the user appears in Settings -> Users & Roles after app data loads.

## Implemented Scope

- Toggle between Sign in and Create account on the existing login screen.
- Create account fields: full name, email, password, confirm password, and role.
- Role options come from the existing app roles: admin, specialist, analyst, and viewer.
- Signup validates required fields, password length, and password confirmation.
- Signup calls Supabase Auth with user metadata for full name, display name, and selected role.
- Existing sign-in, forgot-password, and reset-password behavior remains in place.
- New confirmed users get app access through the existing Supabase Auth session flow.

## Supabase Setup

Run `simple-create-account-gateway.sql` in the Supabase SQL Editor. It creates the `public.handle_new_datatrack_user()` trigger function, attaches it to `auth.users`, and seeds the known admin users.

## Test Plan

- Switch between Sign in and Create account.
- Confirm missing fields and password mismatch show errors.
- Create a valid account and confirm Supabase sends the expected confirmation email.
- Confirm the new account appears in Supabase Authentication -> Users.
- Confirm the matching row appears in `public.users`.
- Confirm the selected role is saved, with invalid or missing roles falling back to viewer.
- Confirm a confirmed user can sign in and appears in Settings -> Users & Roles.
- Confirm forgot-password and reset-password still work.
