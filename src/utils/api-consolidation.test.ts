import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';

import { readJson, readRawBody, resolveDynamicParam } from '../../api/_lib/http';
import smsRouter from '../../api/sms/[action]';
import subscriptionsRouter from '../../api/subscriptions/[action]';
import feedbackRouter from '../../api/feedback/[action]';
import cronRouter from '../../api/cron/[job]';
import webhooksRouter, { config as webhooksConfig } from '../../api/webhooks/[provider]';
import adminHealthHandler from '../../api/admin/health';
import { verifyWebhookSignature } from '../../api/_lib/sms';
import { verifyWebhookSecretIfConfigured } from '../../api/_lib/moolre';

function collectVercelServerlessFunctions(dir: string, root = dir): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const results: string[] = [];

  for (const entry of entries) {
    // Vercel ignores any file or folder prefixed with "_"
    if (entry.name.startsWith('_')) continue;

    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectVercelServerlessFunctions(full, root));
    } else if (/\.(ts|js|mjs|cjs)$/.test(entry.name)) {
      results.push(path.relative(root, full).replace(/\\/g, '/'));
    }
  }

  return results.sort();
}

function createMockReq(options: {
  method?: string;
  url?: string;
  params?: Record<string, string>;
  query?: Record<string, string | string[]>;
  headers?: Record<string, string>;
  body?: unknown;
  rawBody?: string;
}) {
  const stream =
    options.rawBody !== undefined
      ? Readable.from([Buffer.from(options.rawBody, 'utf8')])
      : Readable.from([]);

  return Object.assign(stream, {
    method: options.method || 'GET',
    url: options.url || '/',
    params: options.params || {},
    query: options.query || {},
    headers: options.headers || {},
    body: options.body,
  });
}

function createMockRes() {
  const res: {
    statusCode: number;
    jsonBody: any;
    headersSent: boolean;
    status: (code: number) => any;
    json: (payload: any) => any;
  } = {
    statusCode: 200,
    jsonBody: undefined,
    headersSent: false,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: any) {
      res.headersSent = true;
      res.jsonBody = payload;
      return res;
    },
  };
  return res;
}

test('Vercel Serverless Function count under api/ is <= 12 (Hobby plan limit)', () => {
  const apiDir = path.resolve(process.cwd(), 'api');
  const functions = collectVercelServerlessFunctions(apiDir);

  assert.ok(functions.length <= 12, `Expected <= 12 functions, got ${functions.length}: ${functions.join(', ')}`);
  assert.deepEqual(functions, [
    'admin/health.ts',
    'cron/[job].ts',
    'feedback/[action].ts',
    'sms/[action].ts',
    'subscriptions/[action].ts',
    'webhooks/[provider].ts',
  ]);
});

test('Frontend source under src/ never references server-only secrets', () => {
  const srcDir = path.resolve(process.cwd(), 'src');
  const forbidden = [
    'SUPABASE_SERVICE_ROLE_KEY',
    'MOOLRE_API_PUBKEY',
    'MOOLRE_API_USER',
    'MOOLRE_WEBHOOK_SECRET',
    'SASUSYNC_API_KEY',
    'SASUSYNC_WEBHOOK_SECRET',
    'CRON_SECRET',
  ];

  function scanDir(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanDir(full);
      } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name) && !entry.name.endsWith('.test.ts')) {
        const content = fs.readFileSync(full, 'utf8');
        for (const secret of forbidden) {
          assert.equal(
            content.includes(secret),
            false,
            `Forbidden server secret "${secret}" found in frontend file ${full}`
          );
        }
      }
    }
  }

  scanDir(srcDir);
});

test('resolveDynamicParam resolves Express params, Vercel query, and URL pathnames', () => {
  assert.equal(
    resolveDynamicParam({ params: { action: 'Send' } }, 'action', 'sms'),
    'send'
  );
  assert.equal(
    resolveDynamicParam({ query: { action: 'verify' } }, 'action', 'subscriptions'),
    'verify'
  );
  assert.equal(
    resolveDynamicParam({ query: { job: ['process-reminders'] } }, 'job', 'cron'),
    'process-reminders'
  );
  assert.equal(
    resolveDynamicParam({ url: '/api/webhooks/sasu-sync?foo=1' }, 'provider', 'webhooks'),
    'sasu-sync'
  );
});

test('readRawBody and readJson handle raw streams and parsed objects', async () => {
  const rawReq = createMockReq({ rawBody: '{"hello":"world"}' });
  assert.equal(await readRawBody(rawReq), '{"hello":"world"}');

  const jsonStreamReq = createMockReq({ rawBody: '{"token":"abc"}' });
  assert.deepEqual(await readJson(jsonStreamReq), { token: 'abc' });

  const parsedReq = createMockReq({ body: { reference: 'SB-SUB-1' } });
  assert.deepEqual(await readJson(parsedReq), { reference: 'SB-SUB-1' });
});

test('Consolidated dynamic routers return 404 for unknown routes', async () => {
  for (const [router, url, key] of [
    [smsRouter, '/api/sms/unknown', 'action'],
    [subscriptionsRouter, '/api/subscriptions/unknown', 'action'],
    [feedbackRouter, '/api/feedback/unknown', 'action'],
    [cronRouter, '/api/cron/unknown', 'job'],
    [webhooksRouter, '/api/webhooks/unknown', 'provider'],
  ] as const) {
    const req = createMockReq({ method: 'GET', url, query: { [key]: 'unknown' } });
    const res = createMockRes();
    await router(req, res);
    assert.equal(res.statusCode, 404);
  }
});

test('SMS consolidated router preserves method guards and auth enforcement', async () => {
  {
    const req = createMockReq({ method: 'GET', url: '/api/sms/send', query: { action: 'send' } });
    const res = createMockRes();
    await smsRouter(req, res);
    assert.equal(res.statusCode, 405);
  }
  {
    const req = createMockReq({ method: 'GET', url: '/api/sms/test', query: { action: 'test' } });
    const res = createMockRes();
    await smsRouter(req, res);
    assert.equal(res.statusCode, 405);
  }
  {
    const req = createMockReq({ method: 'POST', url: '/api/sms/test', query: { action: 'test' } });
    const res = createMockRes();
    await smsRouter(req, res);
    assert.equal(res.statusCode, 401);
  }
  {
    const req = createMockReq({ method: 'POST', url: '/api/sms/config', query: { action: 'config' } });
    const res = createMockRes();
    await smsRouter(req, res);
    assert.equal(res.statusCode, 401);
  }
});

test('Subscriptions consolidated router enforces method checks and Bearer authentication', async () => {
  for (const [method, action] of [
    ['GET', 'initiate'],
    ['GET', 'verify'],
    ['POST', 'status'],
  ] as const) {
    const req = createMockReq({ method, url: `/api/subscriptions/${action}`, query: { action } });
    const res = createMockRes();
    await subscriptionsRouter(req, res);
    assert.equal(res.statusCode, 405);
  }

  for (const [method, action] of [
    ['POST', 'initiate'],
    ['POST', 'verify'],
    ['GET', 'status'],
  ] as const) {
    const req = createMockReq({ method, url: `/api/subscriptions/${action}`, query: { action } });
    const res = createMockRes();
    await subscriptionsRouter(req, res);
    assert.equal(res.statusCode, 401);
  }
});

test('Feedback consolidated router enforces method checks and input validation', async () => {
  {
    const req = createMockReq({ method: 'GET', url: '/api/feedback/validate', query: { action: 'validate' } });
    const res = createMockRes();
    await feedbackRouter(req, res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.jsonBody.valid, false);
  }
  {
    const req = createMockReq({ method: 'GET', url: '/api/feedback/submit', query: { action: 'submit' } });
    const res = createMockRes();
    await feedbackRouter(req, res);
    assert.equal(res.statusCode, 405);
  }
  {
    const req = createMockReq({
      method: 'POST',
      url: '/api/feedback/submit',
      query: { action: 'submit' },
      rawBody: JSON.stringify({ customerName: 'Ama', feedback: 'Great!' }),
    });
    const res = createMockRes();
    await feedbackRouter(req, res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.jsonBody.error, 'Missing token');
  }
});

test('Cron consolidated router enforces CRON_SECRET authorization and methods', async () => {
  const prevSecret = process.env.CRON_SECRET;
  process.env.CRON_SECRET = 'test-cron-secret-123';
  try {
    for (const job of ['process-reminders', 'expire-subscriptions'] as const) {
      const badMethodReq = createMockReq({ method: 'DELETE', url: `/api/cron/${job}`, query: { job } });
      const badMethodRes = createMockRes();
      await cronRouter(badMethodReq, badMethodRes);
      assert.equal(badMethodRes.statusCode, 405);

      const unauthReq = createMockReq({ method: 'GET', url: `/api/cron/${job}`, query: { job } });
      const unauthRes = createMockRes();
      await cronRouter(unauthReq, unauthRes);
      assert.equal(unauthRes.statusCode, 401);
    }
  } finally {
    if (prevSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = prevSecret;
  }
});

test('Webhooks consolidated router disables bodyParser and enforces SasuSync HMAC & Moolre secret checks', async () => {
  assert.equal(webhooksConfig.api.bodyParser, false);

  const prevSasu = process.env.SASUSYNC_WEBHOOK_SECRET;
  const prevMoolre = process.env.MOOLRE_WEBHOOK_SECRET;
  process.env.SASUSYNC_WEBHOOK_SECRET = 'sasu-test-secret';
  process.env.MOOLRE_WEBHOOK_SECRET = 'moolre-test-secret';

  try {
    const sasuBadSigReq = createMockReq({
      method: 'POST',
      url: '/api/webhooks/sasu-sync',
      query: { provider: 'sasu-sync' },
      headers: { 'x-webhook-signature': 'deadbeef' },
      rawBody: '{"status":"delivered"}',
    });
    const sasuBadSigRes = createMockRes();
    await webhooksRouter(sasuBadSigReq, sasuBadSigRes);
    assert.equal(sasuBadSigRes.statusCode, 401);

    const crypto = await import('node:crypto');
    const payload = '{"status":"delivered"}';
    const validSig = crypto
      .createHmac('sha256', 'sasu-test-secret')
      .update(payload, 'utf8')
      .digest('hex');
    assert.equal(verifyWebhookSignature(payload, `sha256=${validSig}`, 'sasu-test-secret'), true);

    const moolreBadSecretReq = createMockReq({
      method: 'POST',
      url: '/api/webhooks/moolre',
      query: { provider: 'moolre' },
      headers: { 'x-moolre-secret': 'wrong-secret' },
      rawBody: '{"externalref":"SB-SUB-1"}',
    });
    const moolreBadSecretRes = createMockRes();
    await webhooksRouter(moolreBadSecretReq, moolreBadSecretRes);
    assert.equal(moolreBadSecretRes.statusCode, 401);

    assert.equal(
      verifyWebhookSecretIfConfigured({
        headers: { 'x-moolre-secret': 'moolre-test-secret' },
        query: {},
      }),
      true
    );
  } finally {
    if (prevSasu === undefined) delete process.env.SASUSYNC_WEBHOOK_SECRET;
    else process.env.SASUSYNC_WEBHOOK_SECRET = prevSasu;

    if (prevMoolre === undefined) delete process.env.MOOLRE_WEBHOOK_SECRET;
    else process.env.MOOLRE_WEBHOOK_SECRET = prevMoolre;
  }
});

test('Admin health handler rejects non-GET and returns 200 status report on GET', async () => {
  const badReq = createMockReq({ method: 'POST', url: '/api/admin/health' });
  const badRes = createMockRes();
  await adminHealthHandler(badReq, badRes);
  assert.equal(badRes.statusCode, 405);

  const okReq = createMockReq({ method: 'GET', url: '/api/admin/health' });
  const okRes = createMockRes();
  await adminHealthHandler(okReq, okRes);
  assert.equal(okRes.statusCode, 200);
  assert.equal(okRes.jsonBody.ok, true);
  assert.ok(Array.isArray(okRes.jsonBody.checks));
});
