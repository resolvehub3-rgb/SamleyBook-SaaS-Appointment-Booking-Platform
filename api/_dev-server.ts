import 'dotenv/config';
import express from 'express';

const app = express();

// Webhook routes run BEFORE express.json() so raw request body is preserved for HMAC verification.
app.all('/api/webhooks/:provider', async (req, res) => {
  try {
    const mod: any = await import('./webhooks/[provider].ts');
    await mod.default(req, res);
  } catch (err) {
    console.error('Dev server webhook error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Internal error' });
    }
  }
});

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

const handlerMap: Record<string, string> = {
  '/api/admin/health': './admin/health.ts',
  '/api/sms/:action': './sms/[action].ts',
  '/api/feedback/:action': './feedback/[action].ts',
  '/api/subscriptions/:action': './subscriptions/[action].ts',
  '/api/cron/:job': './cron/[job].ts',
};

for (const [route, modulePath] of Object.entries(handlerMap)) {
  app.all(route, async (req, res) => {
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
  });
}

const port = Number(process.env.API_PORT || 3001);
app.listen(port, () => {
  console.log(`SamleyBook API dev server running on http://localhost:${port}`);
});
