import { resolveDynamicParam } from '../_lib/http.js';
import {
  handleSubscriptionsInitiate,
  handleSubscriptionsStatus,
  handleSubscriptionsVerify,
} from '../_lib/handlers/subscriptions.js';

export default async function handler(req: any, res: any) {
  const action = resolveDynamicParam(req, 'action', 'subscriptions');

  switch (action) {
    case 'initiate':
      return handleSubscriptionsInitiate(req, res);
    case 'verify':
      return handleSubscriptionsVerify(req, res);
    case 'status':
      return handleSubscriptionsStatus(req, res);
    default:
      res.status(404).json({ error: 'Not found' });
      return;
  }
}
