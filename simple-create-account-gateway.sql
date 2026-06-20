create or replace function public.handle_new_datatrack_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_role text;
  profile_name text;
begin
  selected_role := coalesce(new.raw_user_meta_data->>'role', 'viewer');

  if selected_role not in ('admin', 'specialist', 'analyst', 'viewer') then
    selected_role := 'viewer';
  end if;

  profile_name := coalesce(
    nullif(new.raw_user_meta_data->>'full_name', ''),
    split_part(new.email, '@', 1)
  );

  insert into public.users (
    id,
    full_name,
    email,
    display_name,
    role,
    is_active,
    last_active,
    created_at
  )
  values (
    new.id::text,
    profile_name,
    new.email,
    profile_name,
    selected_role,
    true,
    now(),
    now()
  )
  on conflict (email) do update set
    full_name = excluded.full_name,
    display_name = excluded.display_name,
    role = excluded.role,
    is_active = true,
    last_active = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_datatrack on auth.users;

create trigger on_auth_user_created_datatrack
after insert on auth.users
for each row execute function public.handle_new_datatrack_user();

insert into public.users (
  id,
  full_name,
  email,
  display_name,
  role,
  is_active,
  last_active,
  created_at
)
values
  ('user_gresha_shah', 'Gresha Shah', 'gresha@servehousing.org', 'Gresha Shah', 'admin', true, now(), now()),
  ('user_breah_cuppoletti', 'Breah Cuppoletti', 'breah@servefoundation.org', 'Breah Cuppoletti', 'admin', true, now(), now()),
  ('user_bob_hoff', 'Bob Hoff', 'bob@servefoundation.org', 'Bob Hoff', 'admin', true, now(), now())
on conflict (email) do update set
  full_name = excluded.full_name,
  display_name = excluded.display_name,
  role = excluded.role,
  is_active = true,
  last_active = now();
