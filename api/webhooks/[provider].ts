import { resolveDynamicParam } from '../_lib/http.js';
import {
  handleMoolreWebhook,
  handleSasuSyncWebhook,
} from '../_lib/handlers/webhooks.js';

// Keep bodyParser disabled so SasuSync HMAC-SHA256 verification always inspects exact raw bytes.
export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req: any, res: any) {
  const provider = resolveDynamicParam(req, 'provider', 'webhooks');

  switch (provider) {
    case 'sasu-sync':
      return handleSasuSyncWebhook(req, res);
    case 'moolre':
      return handleMoolreWebhook(req, res);
    default:
      res.status(404).json({ error: 'Not found' });
      return;
  }
}
