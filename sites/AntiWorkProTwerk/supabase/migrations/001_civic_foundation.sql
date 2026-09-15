-- Public civic records and private account data. Apply with a Supabase migration.
create table public.sources (
  id text primary key, url text not null, collected_at timestamptz not null,
  transformation_version text not null, archive_key text, kind text not null check(kind in ('demo','official'))
);
create table public.politicians (
  id text primary key, state text not null check(state ~ '^[A-Z]{2}$'), name text not null,
  party text not null check(party in ('R','D','I')), summary jsonb not null,
  source_id text not null references public.sources(id), updated_at timestamptz not null default now()
);
create table public.bills (id text primary key, number text not null, title text not null, description text not null, status text not null, source_id text not null references public.sources(id));
create table public.votes (
  politician_id text not null references public.politicians(id), bill_id text not null references public.bills(id),
  vote text not null check(vote in ('Yea','Nay','Not voting')), voted_at date not null,
  source_id text not null references public.sources(id), primary key(politician_id,bill_id,voted_at)
);
create table public.donation_summaries (
  politician_id text not null references public.politicians(id), category text not null,
  amount numeric(16,2) not null check(amount>=0), source_id text not null references public.sources(id),
  primary key(politician_id,category,source_id)
);
create table public.dataset_releases (id text primary key, published_at timestamptz not null, manifest jsonb not null);
create materialized view public.politician_statistics as
  select p.id,p.state,
    (select count(*) from public.votes v where v.politician_id=p.id) as recorded_votes,
    (select coalesce(sum(d.amount),0) from public.donation_summaries d where d.politician_id=p.id) as total_contributions
  from public.politicians p;
create unique index politician_statistics_id on public.politician_statistics(id);
create index politicians_state on public.politicians(state);

create table public.saved_politicians (
  user_id uuid not null references auth.users(id) on delete cascade,
  politician_id text not null, name text not null check(length(name)<=120), state text not null check(state ~ '^[A-Z]{2}$'),
  note text not null default '' check(length(note)<=2000), updated_at timestamptz not null default now(),
  primary key(user_id,politician_id)
);
create table public.preferences (user_id uuid primary key references auth.users(id) on delete cascade,settings jsonb not null default '{}'::jsonb);
create table public.subscriptions (
  id text primary key, user_id uuid not null references auth.users(id) on delete cascade,
  customer_id text not null, status text not null, current_period_end timestamptz not null,
  event_created bigint not null, updated_at timestamptz not null default now()
);
create index subscriptions_user on public.subscriptions(user_id);
create table public.stripe_events (id text primary key,created bigint not null,received_at timestamptz not null default now());
create table public.premium_analysis (politician_id text primary key,analysis text not null,updated_at timestamptz not null default now());

alter table public.sources enable row level security;
alter table public.politicians enable row level security;
alter table public.bills enable row level security;
alter table public.votes enable row level security;
alter table public.donation_summaries enable row level security;
alter table public.dataset_releases enable row level security;
alter table public.saved_politicians enable row level security;
alter table public.preferences enable row level security;
alter table public.subscriptions enable row level security;
alter table public.stripe_events enable row level security;
alter table public.premium_analysis enable row level security;

create policy public_sources on public.sources for select to anon,authenticated using(true);
create policy public_people on public.politicians for select to anon,authenticated using(true);
create policy public_bills on public.bills for select to anon,authenticated using(true);
create policy public_votes on public.votes for select to anon,authenticated using(true);
create policy public_donation_summaries on public.donation_summaries for select to anon,authenticated using(true);
create policy public_releases on public.dataset_releases for select to anon,authenticated using(true);
create policy own_saved on public.saved_politicians for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy own_preferences on public.preferences for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy own_subscription on public.subscriptions for select to authenticated using(user_id=(select auth.uid()));
create function public.is_subscriber() returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.subscriptions where user_id=(select auth.uid()) and status in ('active','trialing') and current_period_end>now());
$$;
revoke all on function public.is_subscriber() from public;
grant execute on function public.is_subscriber() to authenticated;
create policy subscriber_analysis on public.premium_analysis for select to authenticated using((select public.is_subscriber()));

-- One transaction makes duplicate and out-of-order webhook processing safe.
create function public.record_subscription_event(
  p_event_id text,p_event_created bigint,p_subscription_id text,p_user_id uuid,
  p_customer_id text,p_status text,p_period_end timestamptz
) returns void language plpgsql security definer set search_path='' as $$
declare inserted_id text;
begin
  insert into public.stripe_events(id,created) values(p_event_id,p_event_created)
    on conflict(id) do nothing returning id into inserted_id;
  if inserted_id is null then return; end if;
  insert into public.subscriptions(id,user_id,customer_id,status,current_period_end,event_created)
    values(p_subscription_id,p_user_id,p_customer_id,p_status,p_period_end,p_event_created)
    on conflict(id) do update set status=excluded.status,current_period_end=excluded.current_period_end,
      event_created=excluded.event_created,updated_at=now()
    where public.subscriptions.event_created<=excluded.event_created;
end;
$$;
revoke all on function public.record_subscription_event(text,bigint,text,uuid,text,text,timestamptz) from public;
grant execute on function public.record_subscription_event(text,bigint,text,uuid,text,text,timestamptz) to service_role;
create function public.refresh_civic_summaries() returns void language sql security definer set search_path='' as $$ refresh materialized view public.politician_statistics; $$;
revoke all on function public.refresh_civic_summaries() from public;
grant execute on function public.refresh_civic_summaries() to service_role;

-- Override any broad Supabase default privileges before granting the exact operations.
revoke all on public.sources,public.politicians,public.bills,public.votes,public.donation_summaries,public.dataset_releases,public.politician_statistics,public.saved_politicians,public.preferences,public.subscriptions,public.stripe_events,public.premium_analysis from anon,authenticated;
grant select on public.sources,public.politicians,public.bills,public.votes,public.donation_summaries,public.dataset_releases,public.politician_statistics to anon,authenticated;
grant select,insert,update,delete on public.saved_politicians,public.preferences to authenticated;
grant select on public.subscriptions,public.premium_analysis to authenticated;
grant all on public.sources,public.politicians,public.bills,public.votes,public.donation_summaries,public.dataset_releases,public.saved_politicians,public.preferences,public.subscriptions,public.stripe_events,public.premium_analysis to service_role;
