-- Allow appointment triggers and backend flows to insert notification rows.
-- The create_appointment_reminder_record trigger runs as the invoking user,
-- so sms_notifications needs an insert policy (or a SECURITY DEFINER trigger).

alter table public.sms_notifications enable row level security;

drop policy if exists "System can insert sms notifications" on public.sms_notifications;
create policy "System can insert sms notifications"
  on public.sms_notifications
  for insert
  to authenticated
  with check (true);

-- Make the reminder trigger SECURITY DEFINER so it bypasses RLS regardless of caller.
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
