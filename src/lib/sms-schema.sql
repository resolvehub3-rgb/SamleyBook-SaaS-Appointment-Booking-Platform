-- SasuSync SMS integration schema for SamleyBook

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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_sms_notifications_business_id on public.sms_notifications(business_id);
create index if not exists idx_sms_notifications_appointment_id on public.sms_notifications(appointment_id);
create index if not exists idx_sms_notifications_task_id on public.sms_notifications(sasusync_task_id);
create index if not exists idx_sms_notifications_message_id on public.sms_notifications(sasusync_message_id);
create index if not exists idx_sms_notifications_scheduled_for on public.sms_notifications(scheduled_for);

-- updated_at trigger
create or replace function public.set_sms_notifications_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_sms_notifications_updated_at on public.sms_notifications;
create trigger trg_sms_notifications_updated_at
before update on public.sms_notifications
for each row execute function public.set_sms_notifications_updated_at();

-- Create a reminder record when an eligible appointment is confirmed
create or replace function public.create_appointment_reminder_record()
returns trigger as $$
begin
  if (TG_OP = 'INSERT' and NEW.status = 'confirmed')
     or (TG_OP = 'UPDATE' and NEW.status = 'confirmed' and OLD.status is distinct from 'confirmed') then
    insert into public.sms_notifications (
      business_id,
      customer_id,
      appointment_id,
      notification_type,
      recipient,
      message,
      idempotency_key,
      submission_status,
      delivery_status,
      scheduled_for,
      metadata
    ) values (
      NEW.business_id,
      NEW.customer_id,
      NEW.id,
      'appointment_reminder',
      coalesce(NEW.customer_phone, ''),
      'PENDING',
      'appointment_reminder:' || NEW.id::text,
      'pending',
      'queued',
      (NEW.appointment_date::timestamp + NEW.appointment_time::time) - interval '24 hours',
      jsonb_build_object('appointmentId', NEW.id)
    )
    on conflict (idempotency_key) do nothing;
  end if;
  return NEW;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_appointment_reminder on public.appointments;
create trigger trg_appointment_reminder
after insert or update on public.appointments
for each row execute function public.create_appointment_reminder_record();

-- RLS: admins only
alter table public.sms_notifications enable row level security;

drop policy if exists "Admins can view sms notifications" on public.sms_notifications;
create policy "Admins can view sms notifications"
on public.sms_notifications
for select
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'super_admin'
  )
);

drop policy if exists "System can insert sms notifications" on public.sms_notifications;
create policy "System can insert sms notifications"
on public.sms_notifications
for insert
to authenticated
with check (true);