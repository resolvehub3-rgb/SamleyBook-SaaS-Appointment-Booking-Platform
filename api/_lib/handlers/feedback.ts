import { getServiceSupabase } from '../supabase.js';
import { readJson } from '../http.js';
import { createAndDispatchOwnerNotification } from '../push.js';
import { buildDeepLinkDestination, buildInAppNotificationCopy } from '../../../src/utils/notifications.js';

export async function handleFeedbackValidate(req: any, res: any) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  let body: any = {};
  if (req.method === 'POST') {
    try {
      body = await readJson(req);
    } catch {
      res.status(400).json({ valid: false, reason: 'Invalid JSON body' });
      return;
    }
  }

  const token = req.method === 'GET' ? (req.query?.token as string) : body.token;
  if (!token) {
    res.status(400).json({ valid: false, reason: 'Missing token' });
    return;
  }

  const supabase = getServiceSupabase();
  const { data: tokenRow, error } = await supabase
    .from('feedback_tokens')
    .select('id, token, business_id, appointment_id, customer_id, used_at, expires_at')
    .eq('token', token)
    .maybeSingle();

  if (error || !tokenRow) {
    res.status(200).json({ valid: false, reason: 'Invalid or expired feedback link.' });
    return;
  }

  if (tokenRow.used_at) {
    res.status(200).json({ valid: false, reason: 'This feedback link has already been used.' });
    return;
  }

  if (tokenRow.expires_at && new Date(tokenRow.expires_at) < new Date()) {
    res.status(200).json({ valid: false, reason: 'This feedback link has expired.' });
    return;
  }

  const { data: appointment } = await supabase
    .from('appointments')
    .select('id, customer_name, appointment_date, appointment_time, service:services(name), business:businesses(name)')
    .eq('id', tokenRow.appointment_id)
    .single();

  res.status(200).json({
    valid: true,
    businessName: (appointment as any)?.business?.name || '',
    serviceName: (appointment as any)?.service?.name || '',
    appointmentRef: String(tokenRow.appointment_id).substring(0, 8).toUpperCase(),
    customerName: appointment?.customer_name || '',
  });
}

export async function handleFeedbackSubmit(req: any, res: any) {
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
  const { data: insertedFeedback, error: insertError } = await supabase
    .from('customer_feedback')
    .insert({
      business_id: tokenRow.business_id,
      appointment_id: tokenRow.appointment_id,
      customer_id: tokenRow.customer_id || appointment.customer_id || null,
      feedback_token_id: tokenRow.id,
      customer_name: customerName,
      service_id: appointment.service_id || null,
      feedback,
    })
    .select('id')
    .single();

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

  if (insertedFeedback?.id) {
    try {
      const [{ data: biz }, { data: svc }] = await Promise.all([
        supabase
          .from('businesses')
          .select('id, name, owner_id')
          .eq('id', tokenRow.business_id)
          .maybeSingle(),
        appointment.service_id
          ? supabase.from('services').select('name').eq('id', appointment.service_id).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      if (biz?.owner_id) {
        const copy = buildInAppNotificationCopy({
          category: 'feedback',
          businessName: biz.name,
          customerName,
          serviceName: svc?.name || 'Service',
          feedbackPreview: feedback,
        });

        await createAndDispatchOwnerNotification(supabase, {
          userId: biz.owner_id,
          businessId: biz.id,
          category: 'feedback',
          title: copy.title,
          body: copy.body,
          entityType: 'feedback',
          entityId: insertedFeedback.id,
          destinationUrl: buildDeepLinkDestination({
            category: 'feedback',
            feedbackId: insertedFeedback.id,
          }),
          metadata: {
            feedback_id: insertedFeedback.id,
            appointment_id: tokenRow.appointment_id,
            business_name: biz.name,
            customer_name: customerName,
            service_name: svc?.name || 'Service',
          },
          idempotencyKey: `feedback:${insertedFeedback.id}`,
        });
      }
    } catch (pushErr) {
      console.error('Feedback owner push error:', pushErr);
    }
  }

  res.status(200).json({ ok: true, message: 'Feedback submitted successfully. Thank you!' });
}
