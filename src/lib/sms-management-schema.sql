-- SMS Management module schema for SamleyBook (SasuSync)

-- Platform SMS settings (single row)
create table if not exists public.sms_platform_settings (
  id uuid primary key default gen_random_uuid(),
  sms_enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

insert into public.sms_platform_settings (sms_enabled)
select true
where not exists (select 1 from public.sms_platform_settings);

-- SMS templates
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

-- Seed default templates
insert into public.sms_templates (template_key, name, notification_type, content, placeholders)
values
  ('business_registration', 'Business Registration Confirmation', 'business_registration',
   'Welcome to SamleyBook! Your business [Business Name] has been successfully registered. Your 7-day free trial is now active. Access your dashboard: [Dashboard Link].',
   array['Business Name','Dashboard Link']),
  ('booking_confirmation', 'Customer Booking Confirmation', 'booking_confirmation',
   'Hello [Customer Name], your appointment with [Business Name] is scheduled for [Appointment Date] at [Appointment Time]. Thank you for choosing us.',
   array['Customer Name','Business Name','Appointment Date','Appointment Time']),
  ('appointment_reminder', 'Appointment Reminder', 'appointment_reminder',
   'Hello [Customer Name], this is a reminder that your appointment with [Business Name] is scheduled for tomorrow at [Appointment Time]. We look forward to seeing you.',
   array['Customer Name','Business Name','Appointment Time']),
  ('test_sms', 'Test SMS', 'test_sms',
   'This is a test message from SamleyBook SMS Management. SasuSync integration is working correctly.',
   array[]::text[])
on conflict (template_key) do nothing;

-- Audit log
create table if not exists public.sms_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  details jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- RLS
alter table public.sms_platform_settings enable row level security;
alter table public.sms_templates enable row level security;
alter table public.sms_audit_logs enable row level security;

-- Super admin full access
create policy "Super admins manage sms settings"
  on public.sms_platform_settings
  for all
  to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin'));

create policy "Super admins manage sms templates"
  on public.sms_templates
  for all
  to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin'));

create policy "Super admins view sms audit logs"
  on public.sms_audit_logs
  for select
  to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin'));

create policy "Super admins insert sms audit logs"
  on public.sms_audit_logs
  for insert
  to authenticated
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin'));

-- updated_at trigger for templates/settings
create or replace function public.set_sms_templates_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_sms_templates_updated_at on public.sms_templates;
create trigger trg_sms_templates_updated_at
before update on public.sms_templates
for each row execute function public.set_sms_templates_updated_at();

create or replace function public.set_sms_settings_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_sms_settings_updated_at on public.sms_platform_settings;
create trigger trg_sms_settings_updated_at
before update on public.sms_platform_settings
for each row execute function public.set_sms_settings_updated_at();