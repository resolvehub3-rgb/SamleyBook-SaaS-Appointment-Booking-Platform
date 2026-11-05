-- =====================================================================
-- SamleyBook: SMS feedback, tokens, and per-business SMS usage tracking
-- =====================================================================

-- Retry tracking columns on sms_notifications
alter table public.sms_notifications
  add column if not exists retry_count integer not null default 0,
  add column if not exists next_retry_at timestamptz;

-- Feedback tokens (secure, unpredictable)
create table if not exists public.feedback_tokens (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  business_id uuid not null references public.businesses(id) on delete cascade,
  appointment_id uuid not null references public.appointments(id) on delete cascade unique,
  customer_id uuid references public.customers(id) on delete set null,
  expires_at timestamptz,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_feedback_tokens_token on public.feedback_tokens(token);
create index if not exists idx_feedback_tokens_business on public.feedback_tokens(business_id);
create index if not exists idx_feedback_tokens_appointment on public.feedback_tokens(appointment_id);

-- Customer feedback records
create table if not exists public.customer_feedback (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  appointment_id uuid not null references public.appointments(id) on delete cascade unique,
  customer_id uuid references public.customers(id) on delete set null,
  feedback_token_id uuid references public.feedback_tokens(id) on delete set null,
  customer_name text not null,
  service_id uuid references public.services(id) on delete set null,
  feedback text not null,
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_customer_feedback_business on public.customer_feedback(business_id);
create index if not exists idx_customer_feedback_appointment on public.customer_feedback(appointment_id);
create index if not exists idx_customer_feedback_submitted on public.customer_feedback(submitted_at);

-- Per-business SMS usage tracking
create table if not exists public.business_sms_usage (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  total_sent integer not null default 0,
  total_accepted integer not null default 0,
  total_delivered integer not null default 0,
  total_failed integer not null default 0,
  last_sms_at timestamptz,
  updated_at timestamptz not null default now()
);

-- Maintain per-business usage from sms_notifications
create or replace function public.update_business_sms_usage()
returns trigger as $$
begin
  if TG_OP = 'INSERT' then
    if NEW.business_id is not null then
      insert into public.business_sms_usage (business_id, total_sent, total_accepted, total_failed, last_sms_at, updated_at)
      values (
        NEW.business_id,
        1,
        case when NEW.submission_status = 'accepted' then 1 else 0 end,
        case when NEW.submission_status = 'failed' then 1 else 0 end,
        NEW.created_at,
        now()
      )
      on conflict (business_id) do update set
        total_sent = public.business_sms_usage.total_sent + 1,
        total_accepted = public.business_sms_usage.total_accepted + case when NEW.submission_status = 'accepted' then 1 else 0 end,
        total_failed = public.business_sms_usage.total_failed + case when NEW.submission_status = 'failed' then 1 else 0 end,
        last_sms_at = greatest(public.business_sms_usage.last_sms_at, NEW.created_at),
        updated_at = now();
    end if;
  elsif TG_OP = 'UPDATE' then
    if NEW.business_id is not null then
      update public.business_sms_usage
      set
        total_accepted = total_accepted + case
          when NEW.submission_status = 'accepted' and OLD.submission_status is distinct from 'accepted' then 1
          when OLD.submission_status = 'accepted' and NEW.submission_status is distinct from 'accepted' then -1
          else 0 end,
        total_delivered = total_delivered + case
          when NEW.delivery_status = 'delivered' and OLD.delivery_status is distinct from 'delivered' then 1
          when OLD.delivery_status = 'delivered' and NEW.delivery_status is distinct from 'delivered' then -1
          else 0 end,
        total_failed = total_failed + case
          when NEW.delivery_status = 'failed' and OLD.delivery_status is distinct from 'failed' then 1
          when OLD.delivery_status = 'failed' and NEW.delivery_status is distinct from 'failed' then -1
          else 0 end,
        updated_at = now()
      where business_id = NEW.business_id;
    end if;
  end if;
  return NEW;
end;
$$ language plpgsql;

drop trigger if exists trg_business_sms_usage on public.sms_notifications;
create trigger trg_business_sms_usage
after insert or update on public.sms_notifications
for each row
execute function public.update_business_sms_usage();

-- RLS
alter table public.feedback_tokens enable row level security;
alter table public.customer_feedback enable row level security;
alter table public.business_sms_usage enable row level security;

-- feedback_tokens: super admin full; owners view own
drop policy if exists "Super admins manage feedback tokens" on public.feedback_tokens;
create policy "Super admins manage feedback tokens"
  on public.feedback_tokens for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists "Owners view own feedback tokens" on public.feedback_tokens;
create policy "Owners view own feedback tokens"
  on public.feedback_tokens for select to authenticated
  using (exists (select 1 from public.businesses b where b.id = feedback_tokens.business_id and b.owner_id = auth.uid()));

-- customer_feedback: super admin full; owners view own
drop policy if exists "Super admins manage customer feedback" on public.customer_feedback;
create policy "Super admins manage customer feedback"
  on public.customer_feedback for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists "Owners view own customer feedback" on public.customer_feedback;
create policy "Owners view own customer feedback"
  on public.customer_feedback for select to authenticated
  using (exists (select 1 from public.businesses b where b.id = customer_feedback.business_id and b.owner_id = auth.uid()));

-- business_sms_usage: super admin + owners view
drop policy if exists "Super admins view business sms usage" on public.business_sms_usage;
create policy "Super admins view business sms usage"
  on public.business_sms_usage for select to authenticated
  using (public.is_super_admin());

drop policy if exists "Owners view own business sms usage" on public.business_sms_usage;
create policy "Owners view own business sms usage"
  on public.business_sms_usage for select to authenticated
  using (exists (select 1 from public.businesses b where b.id = business_sms_usage.business_id and b.owner_id = auth.uid()));

-- Realtime for feedback
alter publication supabase_realtime add table public.customer_feedback;
