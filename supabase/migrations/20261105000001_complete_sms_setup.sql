-- =====================================================================
-- SamleyBook: Complete idempotent SMS + feedback setup
-- Run this in Supabase SQL Editor if SMS config/tables are missing.
-- =====================================================================

-- sms_notifications
create table if not exists public.sms_notifications (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  appointment_id uuid references public.appointments(id) on delete set null,
  notification_type text not null,
  recipient text not null,
  message text not null default '',
  sasusync_task_id text,
  sasusync_message_id text,
  idempotency_key text not null unique,
  submission_status text not null default 'pending',
  delivery_status text not null default 'queued',
  error_details text,
  metadata jsonb default '{}'::jsonb,
  scheduled_for timestamptz,
  retry_count integer not null default 0,
  next_retry_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_sms_notifications_business_id on public.sms_notifications(business_id);
create index if not exists idx_sms_notifications_appointment_id on public.sms_notifications(appointment_id);
create index if not exists idx_sms_notifications_task_id on public.sms_notifications(sasusync_task_id);
create index if not exists idx_sms_notifications_message_id on public.sms_notifications(sasusync_message_id);
create index if not exists idx_sms_notifications_scheduled_for on public.sms_notifications(scheduled_for);

-- sms_platform_settings
create table if not exists public.sms_platform_settings (
  id uuid primary key default gen_random_uuid(),
  sms_enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

insert into public.sms_platform_settings (sms_enabled)
select true
where not exists (select 1 from public.sms_platform_settings);

-- sms_templates
create table if not exists public.sms_templates (
  id uuid primary key default gen_random_uuid(),
  template_key text not null unique,
  name text not null,
  notification_type text not null,
  content text not null,
  is_enabled boolean not null default true,
  placeholders text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.sms_templates (template_key, name, notification_type, content, placeholders)
values
  ('business_registration', 'Business Registration Confirmation', 'business_registration',
   'Congratulations! Your business [Business Name] has been approved on SamleyBook. Your account is now ready. Log in to manage your business and appointments: [Dashboard Link]. SamleyBook by SamTeck Digital.',
   array['Business Name','Dashboard Link']),
  ('booking_confirmation', 'Customer Booking Confirmation', 'booking_confirmation',
   'Hello [Customer Name], your appointment with [Business Name] is scheduled for [Appointment Date] at [Appointment Time]. Thank you for choosing us.',
   array['Customer Name','Business Name','Appointment Date','Appointment Time']),
  ('appointment_reminder', 'Appointment Reminder', 'appointment_reminder',
   'Hello [Customer Name], this is a reminder that your appointment with [Business Name] is scheduled for tomorrow at [Appointment Time]. We look forward to seeing you.',
   array['Customer Name','Business Name','Appointment Time']),
  ('feedback_invitation', 'Feedback Invitation', 'feedback_invitation',
   'Hello [Customer Name], thank you for visiting [Business Name] for your [Service] appointment. We would appreciate your feedback: [Feedback Link]. Thank you for choosing SamleyBook.',
   array['Customer Name','Business Name','Service','Feedback Link']),
  ('test_sms', 'Test SMS', 'test_sms',
   'This is a test message from SamleyBook SMS Management. SasuSync integration is working correctly.',
   array[]::text[])
on conflict (template_key) do nothing;

-- sms_audit_logs
create table if not exists public.sms_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  details jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- feedback_tokens
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

-- customer_feedback
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

-- business_sms_usage
create table if not exists public.business_sms_usage (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  total_sent integer not null default 0,
  total_accepted integer not null default 0,
  total_delivered integer not null default 0,
  total_failed integer not null default 0,
  last_sms_at timestamptz,
  updated_at timestamptz not null default now()
);

-- RLS
alter table public.sms_notifications enable row level security;
alter table public.sms_platform_settings enable row level security;
alter table public.sms_templates enable row level security;
alter table public.sms_audit_logs enable row level security;
alter table public.feedback_tokens enable row level security;
alter table public.customer_feedback enable row level security;
alter table public.business_sms_usage enable row level security;

-- Policies (idempotent drops)
drop policy if exists "Admins can view sms notifications" on public.sms_notifications;
create policy "Admins can view sms notifications" on public.sms_notifications for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin'));

drop policy if exists "Super admins manage sms settings" on public.sms_platform_settings;
create policy "Super admins manage sms settings" on public.sms_platform_settings for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin'));

drop policy if exists "Super admins manage sms templates" on public.sms_templates;
create policy "Super admins manage sms templates" on public.sms_templates for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin'));

drop policy if exists "Super admins view sms audit logs" on public.sms_audit_logs;
create policy "Super admins view sms audit logs" on public.sms_audit_logs for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin'));

drop policy if exists "Super admins insert sms audit logs" on public.sms_audit_logs;
create policy "Super admins insert sms audit logs" on public.sms_audit_logs for insert to authenticated
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin'));

drop policy if exists "Super admins manage feedback tokens" on public.feedback_tokens;
create policy "Super admins manage feedback tokens" on public.feedback_tokens for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists "Owners view own feedback tokens" on public.feedback_tokens;
create policy "Owners view own feedback tokens" on public.feedback_tokens for select to authenticated
  using (exists (select 1 from public.businesses b where b.id = feedback_tokens.business_id and b.owner_id = auth.uid()));

drop policy if exists "Super admins manage customer feedback" on public.customer_feedback;
create policy "Super admins manage customer feedback" on public.customer_feedback for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists "Owners view own customer feedback" on public.customer_feedback;
create policy "Owners view own customer feedback" on public.customer_feedback for select to authenticated
  using (exists (select 1 from public.businesses b where b.id = customer_feedback.business_id and b.owner_id = auth.uid()));

drop policy if exists "Super admins view business sms usage" on public.business_sms_usage;
create policy "Super admins view business sms usage" on public.business_sms_usage for select to authenticated
  using (public.is_super_admin());

drop policy if exists "Owners view own business sms usage" on public.business_sms_usage;
create policy "Owners view own business sms usage" on public.business_sms_usage for select to authenticated
  using (exists (select 1 from public.businesses b where b.id = business_sms_usage.business_id and b.owner_id = auth.uid()));

-- Realtime (idempotent)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'customer_feedback'
  ) then
    alter publication supabase_realtime add table public.customer_feedback;
  end if;
end
$$;
