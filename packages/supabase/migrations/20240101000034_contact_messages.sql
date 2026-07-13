-- Contact form submissions from the public /contacto marketing page.
create type contact_type as enum ('player', 'owner', 'other');

create table public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  contact_type contact_type not null,
  message text not null,
  created_at timestamptz not null default now()
);

comment on table public.contact_messages is
  'Messages submitted via the public /contacto form. No RLS policies are defined — all access is via the service role: Server Action for insert, future admin tooling for reads.';

alter table public.contact_messages enable row level security;
