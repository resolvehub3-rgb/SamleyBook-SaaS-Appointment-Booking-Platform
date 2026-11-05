import { getServiceSupabase } from '../_lib/supabase.js';

async function readJson(req: any): Promise<any> {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  let body: any;
  try {
    body = await readJson(req);
  } catch {
    res.status(400).json({ error: 'Invalid JSON body' });
    return;
  }

  const token = body.token;
  const customerName = (body.customerName || '').trim();
  const feedback = (body.feedback || '').trim();

  if (!token) {
    res.status(400).json({ error: 'Missing token' });
    return;
  }
  if (!customerName) {
    res.status(400).json({ error: 'Customer name is required' });
    return;
  }
  if (!feedback) {
    res.status(400).json({ error: 'Feedback is required' });
    return;
  }

  const supabase = getServiceSupabase();

  const { data: tokenRow, error } = await supabase
    .from('feedback_tokens')
    .select('id, token, business_id, appointment_id, customer_id, used_at, expires_at')
    .eq('token', token)
    .maybeSingle();

  if (error || !tokenRow) {
    res.status(400).json({ error: 'Invalid feedback link.' });
    return;
  }
  if (tokenRow.used_at) {
    res.status(400).json({ error: 'This feedback link has already been used.' });
    return;
  }
  if (tokenRow.expires_at && new Date(tokenRow.expires_at) < new Date()) {
    res.status(400).json({ error: 'This feedback link has expired.' });
    return;
  }

  const { data: appointment } = await supabase
    .from('appointments')
    .select('id, business_id, customer_id, service_id, status')
    .eq('id', tokenRow.appointment_id)
    .single();

  if (!appointment || appointment.status !== 'completed') {
    res.status(400).json({ error: 'Appointment not eligible for feedback.' });
    return;
  }

  // Insert feedback (unique appointment constraint prevents duplicates)
  const { error: insertError } = await supabase.from('customer_feedback').insert({
    business_id: tokenRow.business_id,
    appointment_id: tokenRow.appointment_id,
    customer_id: tokenRow.customer_id || appointment.customer_id || null,
    feedback_token_id: tokenRow.id,
    customer_name: customerName,
    service_id: appointment.service_id || null,
    feedback,
  });

  if (insertError) {
    // If duplicate, mark token used anyway
    if (insertError.code === '23505') {
      await supabase.from('feedback_tokens').update({ used_at: new Date().toISOString() }).eq('id', tokenRow.id);
      res.status(400).json({ error: 'Feedback has already been submitted for this appointment.' });
      return;
    }
    res.status(500).json({ error: insertError.message });
    return;
  }

  await supabase.from('feedback_tokens').update({ used_at: new Date().toISOString() }).eq('id', tokenRow.id);

  res.status(200).json({ ok: true, message: 'Feedback submitted successfully. Thank you!' });
}
