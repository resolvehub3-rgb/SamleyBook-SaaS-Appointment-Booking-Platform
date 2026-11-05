import crypto from 'node:crypto';

export type SmsType =
  | 'business_registration'
  | 'booking_confirmation'
  | 'appointment_reminder';

export function normalizePhone(phone: string): string {
  const digits = (phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('233') && digits.length >= 12) return digits;
  if (digits.startsWith('0') && digits.length === 10) return '233' + digits.slice(1);
  if (digits.length === 9) return '233' + digits;
  if (digits.startsWith('233')) return digits;
  return digits;
}

export function getSasuSyncEndpoint(): string {
  return (
    process.env.SASUSYNC_BASE_URL ||
    'https://sms.sasusync.com/smssandbox/v1/send'
  );
}

export interface SendSmsInput {
  sender: string;
  recipients: string;
  message: string;
  metadata?: Record<string, unknown>;
  idempotencyKey: string;
}

export interface SendSmsResult {
  ok: boolean;
  status: number;
  taskId: string | null;
  data: unknown;
  error: string | null;
}

export async function sendSasuSyncSms(input: SendSmsInput): Promise<SendSmsResult> {
  const apiKey = process.env.SASUSYNC_API_KEY;
  if (!apiKey) {
    return { ok: false, status: 500, taskId: null, data: null, error: 'Missing SASUSYNC_API_KEY' };
  }

  const sender = (process.env.SASUSYNC_SENDER_ID || input.sender || '').trim();
  if (!sender || sender.length > 11) {
    return { ok: false, status: 500, taskId: null, data: null, error: 'Invalid SASUSYNC_SENDER_ID' };
  }

  const recipients = normalizePhone(input.recipients);
  if (!recipients) {
    return { ok: false, status: 400, taskId: null, data: null, error: 'Invalid recipient phone number' };
  }

  try {
    const response = await fetch(getSasuSyncEndpoint(), {
      method: 'POST',
      headers: {
        'X-API-Key': apiKey,
        'Content-Type': 'application/json',
        'Idempotency-Key': input.idempotencyKey,
      },
      body: JSON.stringify({
        sender,
        recipients,
        message: input.message,
        metadata: input.metadata || {},
      }),
    });

    const text = await response.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }

    const taskId =
      (data && typeof data === 'object' && (data as any).task_id) ||
      (data && typeof data === 'object' && (data as any).taskId) ||
      null;

    return {
      ok: response.ok,
      status: response.status,
      taskId: taskId ? String(taskId) : null,
      data,
      error: response.ok ? null : `SasuSync request failed (${response.status})`,
    };
  } catch (err) {
    return {
      ok: false,
      status: 502,
      taskId: null,
      data: null,
      error: err instanceof Error ? err.message : 'Network error',
    };
  }
}

export function verifyWebhookSignature(rawBody: string, signature: string | undefined, secret: string): boolean {
  if (!signature || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  const provided = signature.replace(/^sha256=/i, '').trim();
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(provided, 'hex'));
  } catch {
    return false;
  }
}

export function businessRegistrationMessage(businessName: string): string {
  return `Welcome to SamleyBook! Your business "${businessName}" has been registered successfully. Start receiving bookings via your unique QR code. - SamleyBook`;
}

export function bookingConfirmationMessage(params: {
  businessName: string;
  customerName: string;
  date: string;
  time: string;
}): string {
  return `Hi ${params.customerName}, your booking with ${params.businessName} is confirmed for ${params.date} at ${params.time}. Thank you for choosing SamleyBook.`;
}

export function appointmentReminderMessage(params: {
  businessName: string;
  customerName: string;
  date: string;
  time: string;
}): string {
  return `Reminder: Hi ${params.customerName}, you have an appointment with ${params.businessName} tomorrow at ${params.time} on ${params.date}. See you soon! - SamleyBook`;
}