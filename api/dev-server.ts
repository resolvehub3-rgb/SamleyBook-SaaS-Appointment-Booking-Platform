import 'dotenv/config';
import express from 'express';

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

const handlerMap: Record<string, string> = {
  '/api/admin/health': './admin/health.ts',
  '/api/sms/send': './sms/send.ts',
  '/api/sms/test': './sms/test.ts',
  '/api/sms/config': './sms/config.ts',
  '/api/feedback/validate': './feedback/validate.ts',
  '/api/feedback/submit': './feedback/submit.ts',
  '/api/subscriptions/initiate': './subscriptions/initiate.ts',
  '/api/subscriptions/verify': './subscriptions/verify.ts',
  '/api/subscriptions/status': './subscriptions/status.ts',
  '/api/cron/process-reminders': './cron/process-reminders.ts',
  '/api/cron/expire-subscriptions': './cron/expire-subscriptions.ts',
  '/api/webhooks/sasu-sync': './webhooks/sasu-sync.ts',
  '/api/webhooks/moolre': './webhooks/moolre.ts',
};

async function runHandler(req: any, res: any, modulePath: string) {
  try {
    const mod: any = await import(modulePath);
    const handler = mod.default;
    if (typeof handler !== 'function') {
      res.status(500).json({ error: 'Handler not found' });
      return;
    }
    await handler(req, res);
  } catch (err) {
    console.error('Dev server handler error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Internal error' });
    }
  }
}

for (const [route, modulePath] of Object.entries(handlerMap)) {
  app.all(route, (req, res) => runHandler(req, res, modulePath));
}

const port = Number(process.env.API_PORT || 3001);
app.listen(port, () => {
  console.log(`SamleyBook API dev server running on http://localhost:${port}`);
});
