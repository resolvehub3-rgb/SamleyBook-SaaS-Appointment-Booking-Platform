import 'dotenv/config';
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT || 3000);
const isProd = process.env.NODE_ENV === 'production';

// Webhook route needs raw body for HMAC signature verification before express.json()
app.all('/api/webhooks/:provider', async (req, res) => {
  try {
    const mod: any = await import('./api/webhooks/[provider].ts');
    if (typeof mod.default !== 'function') {
      res.status(500).json({ error: 'Handler not found' });
      return;
    }
    await mod.default(req, res);
  } catch (err) {
    console.error('Webhook handler error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Internal error' });
    }
  }
});

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

const handlerMap: Record<string, string> = {
  '/api/admin/health': './api/admin/health.ts',
  '/api/sms/:action': './api/sms/[action].ts',
  '/api/feedback/:action': './api/feedback/[action].ts',
  '/api/cron/:job': './api/cron/[job].ts',
  '/api/subscriptions/:action': './api/subscriptions/[action].ts',
  '/api/notifications/:action': './api/notifications/[action].ts',
};

for (const [route, modulePath] of Object.entries(handlerMap)) {
  app.all(route, async (req, res) => {
    try {
      const mod: any = await import(modulePath);
      if (typeof mod.default !== 'function') {
        res.status(500).json({ error: 'Handler not found' });
        return;
      }
      await handler(req, res, mod.default);
    } catch (err) {
      console.error(`API handler error (${route}):`, err);
      if (!res.headersSent) {
        res.status(500).json({ error: err instanceof Error ? err.message : 'Internal error' });
      }
    }
  });
}

async function handler(req: any, res: any, fn: (req: any, res: any) => Promise<void>) {
  await fn(req, res);
}

async function startServer() {
  const httpServer = http.createServer(app);

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const hmrDisabled = process.env.DISABLE_HMR === 'true';
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: !hmrDisabled,
        ws: { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexPath = path.join(distDir, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send('Build output not found. Run npm run build first.');
      }
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`SamleyBook server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
