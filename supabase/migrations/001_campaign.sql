-- Initial installation: execute this entire file once in the Supabase SQL Editor.
-- Not an upgrade script for databases where an earlier 001 was already executed.
begin;

create table public.admin_users (
  user_id uuid primary key references auth.users(id),
  created_at timestamptz not null default now()
);

-- Membership is maintained only through the privileged SQL Editor, never the app.
create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.admin_users where user_id = auth.uid()
  )
$$;

create table public.campaigns (
  id boolean primary key default true check (id),
  content jsonb not null default '{"contact_email":"","beneficiary":"","summary":"","story":"","message":"","expenses":"","photo_url":"","gallery_urls":[],"publication_consent":false,"goal_cents":10000000,"pix_key":"","pix_name":"","pix_city":"","pix_enabled":false}',
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(content) = 'object'),
  -- CHECK expressions must reject NULL as well as false (missing JSON keys).
  check (coalesce(
    jsonb_typeof(content->'goal_cents') = 'number'
    and (content->>'goal_cents') ~ '^[0-9]+$'
    and (content->>'goal_cents')::numeric between 1 and 100000000,
    false
  )),
  check (coalesce(jsonb_typeof(content->'publication_consent') = 'boolean', false)),
  check (coalesce(jsonb_typeof(content->'pix_enabled') = 'boolean', false)),
  check (coalesce(jsonb_typeof(content->'gallery_urls') = 'array', false))
);
insert into public.campaigns default values;

create table public.donations (
  id uuid primary key default gen_random_uuid(),
  amount_cents bigint not null check (amount_cents between 1 and 100000000),
  status text not null default 'confirmed'
    check (status in ('confirmed', 'cancelled', 'corrected')),
  donor_public_name text not null default '' check (length(donor_public_name) <= 100),
  is_anonymous boolean not null default true,
  consent_note text not null default '' check (length(consent_note) <= 1000),
  received_at timestamptz not null,
  confirmed_at timestamptz not null default clock_timestamp(),
  confirmed_by uuid not null default auth.uid() references auth.users(id),
  payment_reference text check (
    payment_reference is null or (
      length(payment_reference) between 1 and 150
      and payment_reference = btrim(payment_reference)
    )
  ),
  admin_notes text not null default '' check (length(admin_notes) <= 2000),
  request_id uuid not null unique,
  -- Fingerprint of normalized input, not credentials or an authentication token.
  request_fingerprint text not null check (length(request_fingerprint) = 64),
  replaces_id uuid unique references public.donations(id),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (received_at <= confirmed_at + interval '1 minute'),
  check (replaces_id is null or replaces_id <> id),
  check (
    is_anonymous or (
      length(btrim(donor_public_name)) > 0 and length(btrim(consent_note)) > 0
    )
  ),
  check (not is_anonymous or donor_public_name = '')
);
create unique index donation_reference on public.donations(payment_reference)
  where payment_reference is not null and status = 'confirmed';
create index donation_recent on public.donations(received_at desc)
  where status = 'confirmed';

create table public.campaign_updates (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 3 and 160),
  body text not null check (length(btrim(body)) between 3 and 6000),
  document_url text not null default ''
    check (document_url = '' or document_url like 'https://%'),
  publication_consent boolean not null check (publication_consent),
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor uuid not null,
  table_name text not null,
  record_id text not null,
  operation text not null check (operation in ('INSERT', 'UPDATE', 'DELETE')),
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default clock_timestamp()
);
create index audit_actor_time on public.audit_logs(actor, created_at desc);

-- Invalidation only: financial totals are always computed from confirmed rows.
create table public.campaign_signal (
  id boolean primary key default true check (id),
  revision bigint not null default 0,
  updated_at timestamptz not null default now()
);
insert into public.campaign_signal default values;

create function public.audit_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  old_data jsonb;
  new_data jsonb;
  row_id text;
  actor_id uuid := auth.uid();
begin
  if actor_id is null or not public.is_admin() then
    raise exception 'Administrator required';
  end if;
  if tg_table_schema <> 'public'
     or tg_table_name not in ('campaigns', 'donations', 'campaign_updates') then
    raise exception 'Unsupported audit target';
  end if;

  -- Explicit operation branches: never dereference an unassigned OLD/NEW record.
  if tg_op <> 'INSERT' then old_data := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then new_data := to_jsonb(new); end if;
  -- ->> produces text for either UUID or boolean primary keys (campaigns = true).
  row_id := coalesce(new_data->>'id', old_data->>'id');
  if row_id is null then raise exception 'Audit target has no id'; end if;

  perform pg_advisory_xact_lock(hashtextextended(actor_id::text, 0));
  if (
    select count(*) from public.audit_logs
    where actor = actor_id and created_at > clock_timestamp() - interval '1 minute'
  ) >= 60 then
    raise exception 'Limite de operações: aguarde um minuto';
  end if;

  insert into public.audit_logs (
    actor, table_name, record_id, operation, before_data, after_data
  ) values (actor_id, tg_table_name, row_id, tg_op, old_data, new_data);
  update public.campaign_signal
    set revision = revision + 1, updated_at = clock_timestamp() where id;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end
$$;
create trigger donations_audit after insert or update on public.donations
  for each row execute function public.audit_change();
create trigger campaigns_audit after update on public.campaigns
  for each row execute function public.audit_change();
create trigger updates_audit after insert or update or delete on public.campaign_updates
  for each row execute function public.audit_change();

-- Only these RPCs may mutate the financial ledger from an application session.
-- SQL types/constraints validate inputs even when the caller bypasses Next.js/Zod.
create function public.record_donation(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  existing public.donations;
  original public.donations;
  result uuid;
  input_id uuid;
  input_version integer;
  input_request uuid;
  input_amount bigint;
  input_received timestamptz;
  input_anonymous boolean;
  input_name text;
  input_consent text;
  input_reference text;
  input_notes text;
  fingerprint text;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Administrator required';
  end if;
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception 'Dados da contribuição inválidos.';
  end if;
  if jsonb_typeof(p->'amount') is distinct from 'number'
     or coalesce(p->>'amount', '') !~ '^[0-9]+$'
     or jsonb_typeof(p->'received_at') is distinct from 'string'
     or jsonb_typeof(p->'is_anonymous') is distinct from 'boolean'
     or jsonb_typeof(p->'request_id') is distinct from 'string'
     or jsonb_typeof(p->'version') is distinct from 'number'
     or coalesce(p->>'version', '') !~ '^[0-9]+$'
     or (p ? 'id' and jsonb_typeof(p->'id') is distinct from 'string')
     or (p ? 'donor_public_name' and jsonb_typeof(p->'donor_public_name') is distinct from 'string')
     or (p ? 'consent_note' and jsonb_typeof(p->'consent_note') is distinct from 'string')
     or (p ? 'payment_reference' and jsonb_typeof(p->'payment_reference') is distinct from 'string')
     or (p ? 'admin_notes' and jsonb_typeof(p->'admin_notes') is distinct from 'string') then
    raise exception 'Dados da contribuição inválidos.';
  end if;

  input_id := nullif(p->>'id', '')::uuid;
  input_version := (p->>'version')::integer;
  input_request := (p->>'request_id')::uuid;
  input_amount := (p->>'amount')::bigint;
  -- Require an ISO timestamp with timezone, not session-dependent local time.
  if p->>'received_at' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$' then
    raise exception 'Informe data e horário com fuso horário.';
  end if;
  input_received := (p->>'received_at')::timestamptz;
  if not isfinite(input_received) or input_received > clock_timestamp() + interval '1 minute' then
    raise exception 'Data de recebimento inválida.';
  end if;
  if (input_id is null and input_version <> 0)
     or (input_id is not null and input_version < 1) then
    raise exception 'Versão do registro inválida.';
  end if;
  input_anonymous := (p->>'is_anonymous')::boolean;
  input_name := case when input_anonymous then '' else btrim(coalesce(p->>'donor_public_name', '')) end;
  input_consent := btrim(coalesce(p->>'consent_note', ''));
  input_reference := nullif(btrim(p->>'payment_reference'), '');
  input_notes := btrim(coalesce(p->>'admin_notes', ''));
  fingerprint := encode(sha256(convert_to(jsonb_build_object(
    'id', input_id, 'version', input_version, 'amount', input_amount,
    'received_at', input_received at time zone 'UTC', 'is_anonymous', input_anonymous,
    'donor_public_name', input_name, 'consent_note', input_consent,
    'payment_reference', input_reference, 'admin_notes', input_notes
  )::text, 'UTF8')), 'hex');

  -- Serialize replays before checking the unique key; simultaneous identical
  -- requests return the same result, rather than racing into a unique violation.
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));
  perform pg_advisory_xact_lock(hashtextextended(input_request::text, 1));
  select * into existing from public.donations where request_id = input_request;
  if existing.id is not null then
    if existing.request_fingerprint <> fingerprint then
      raise exception 'Identificador de operação reutilizado com dados diferentes.';
    end if;
    return existing.id;
  end if;

  if input_id is not null then
    select * into original from public.donations where id = input_id for update;
    if original.id is null or original.status <> 'confirmed'
       or original.version is distinct from input_version then
      raise exception 'Registro alterado. Recarregue a página.';
    end if;
    update public.donations
      set status = 'corrected', updated_at = clock_timestamp(), version = version + 1
      where id = original.id;
  end if;

  insert into public.donations (
    amount_cents, received_at, is_anonymous, donor_public_name, consent_note,
    payment_reference, admin_notes, request_id, request_fingerprint, replaces_id
  ) values (
    input_amount, input_received, input_anonymous, input_name, input_consent,
    input_reference, input_notes, input_request, fingerprint, original.id
  ) returning id into result;
  return result;
end
$$;

create function public.cancel_donation(donation_id uuid, expected_version integer) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Administrator required';
  end if;
  if donation_id is null or expected_version is null or expected_version < 1 then
    raise exception 'Identificador ou versão do registro inválidos.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));
  update public.donations
    set status = 'cancelled', updated_at = clock_timestamp(), version = version + 1
    where id = donation_id and status = 'confirmed' and version = expected_version;
  if not found then raise exception 'Registro alterado. Recarregue a página.'; end if;
end
$$;

-- A single statement gives totals, count and public rows one consistent snapshot.
-- Explicit allowlist: future/private JSON keys must never become public implicitly.
create function public.public_snapshot() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'campaign', (
      select jsonb_build_object(
        'contact_email', coalesce(content->>'contact_email', ''),
        'goal_cents', (content->>'goal_cents')::bigint,
        'publication_consent', (content->>'publication_consent')::boolean,
        'pix_enabled', (content->>'pix_enabled')::boolean,
        'beneficiary', case when (content->>'publication_consent')::boolean then coalesce(content->>'beneficiary', '') else '' end,
        'summary', case when (content->>'publication_consent')::boolean then coalesce(content->>'summary', '') else '' end,
        'story', case when (content->>'publication_consent')::boolean then coalesce(content->>'story', '') else '' end,
        'message', case when (content->>'publication_consent')::boolean then coalesce(content->>'message', '') else '' end,
        'expenses', case when (content->>'publication_consent')::boolean then coalesce(content->>'expenses', '') else '' end,
        'photo_url', case when (content->>'publication_consent')::boolean then coalesce(content->>'photo_url', '') else '' end,
        'gallery_urls', case when (content->>'publication_consent')::boolean then content->'gallery_urls' else '[]'::jsonb end,
        'pix_key', case when (content->>'pix_enabled')::boolean then coalesce(content->>'pix_key', '') else '' end,
        'pix_name', case when (content->>'pix_enabled')::boolean then coalesce(content->>'pix_name', '') else '' end,
        'pix_city', case when (content->>'pix_enabled')::boolean then coalesce(content->>'pix_city', '') else '' end
      ) from public.campaigns where id
    ),
    'total_cents', (select coalesce(sum(amount_cents), 0) from public.donations where status = 'confirmed'),
    'count', (select count(*) from public.donations where status = 'confirmed'),
    'updated_at', (select case when revision = 0 then null else updated_at end from public.campaign_signal where id),
    'donations', coalesce((
      select jsonb_agg(d order by d.received_at desc, d.id) from (
        select id, amount_cents, received_at,
          case when is_anonymous then 'Doador anônimo' else donor_public_name end as name
        from public.donations where status = 'confirmed'
        order by received_at desc, id limit 12
      ) d
    ), '[]'::jsonb),
    'updates', coalesce((
      select jsonb_agg(u order by u.created_at desc, u.id) from (
        select id, title, body, document_url, created_at
        from public.campaign_updates where publication_consent
        order by created_at desc, id limit 30
      ) u
    ), '[]'::jsonb)
  )
$$;

alter table public.admin_users enable row level security;
alter table public.campaigns enable row level security;
alter table public.donations enable row level security;
alter table public.campaign_updates enable row level security;
alter table public.audit_logs enable row level security;
alter table public.campaign_signal enable row level security;

create policy own_admin on public.admin_users
  for select to authenticated using (user_id = auth.uid());
create policy campaign_admin on public.campaigns
  for select to authenticated using (public.is_admin());
create policy campaign_edit on public.campaigns
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
-- No INSERT/UPDATE/DELETE policy on donations, including for authenticated admins.
-- SECURITY DEFINER RPCs enforce authorization and own the only app write path.
create policy donations_read on public.donations
  for select to authenticated using (public.is_admin());
create policy updates_admin on public.campaign_updates
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy audit_read on public.audit_logs
  for select to authenticated using (public.is_admin());
create policy signal_read on public.campaign_signal
  for select to anon, authenticated using (true);

-- Supabase projects may have explicit default grants to anon/authenticated,
-- in addition to PostgreSQL's default PUBLIC EXECUTE on new functions.
revoke all on table public.admin_users, public.campaigns, public.donations,
  public.campaign_updates, public.audit_logs, public.campaign_signal
  from public, anon, authenticated;
revoke all on sequence public.audit_logs_id_seq from public, anon, authenticated;
grant select on public.admin_users, public.audit_logs to authenticated;
grant select on public.campaigns to authenticated;
grant update (content, updated_at) on public.campaigns to authenticated;
grant select on public.donations to authenticated;
grant select, delete on public.campaign_updates to authenticated;
grant insert (title, body, document_url, publication_consent) on public.campaign_updates to authenticated;
grant update (title, body, document_url, publication_consent) on public.campaign_updates to authenticated;
grant select on public.campaign_signal to anon, authenticated;

revoke all on function public.is_admin(), public.audit_change(),
  public.record_donation(jsonb), public.cancel_donation(uuid, integer),
  public.public_snapshot() from public, anon, authenticated;
grant execute on function public.is_admin(), public.record_donation(jsonb),
  public.cancel_donation(uuid, integer) to authenticated;
grant execute on function public.public_snapshot() to anon, authenticated;

alter publication supabase_realtime add table public.campaign_signal;
commit;
