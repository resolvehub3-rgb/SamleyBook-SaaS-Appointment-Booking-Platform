import { resolveDynamicParam } from '../_lib/http.js';
import {
  handleNotificationsConfig,
  handleNotificationsSubscribe,
  handleNotificationsUnsubscribe,
  handleNotificationsTest,
  handleNotificationsDispatchEvent,
  handleNotificationsDispatchPending,
} from '../_lib/handlers/notifications.js';

export default async function handler(req: any, res: any) {
  const action = resolveDynamicParam(req, 'action', 'notifications');

  switch (action) {
    case 'config':
      return handleNotificationsConfig(req, res);
    case 'subscribe':
      return handleNotificationsSubscribe(req, res);
    case 'unsubscribe':
      return handleNotificationsUnsubscribe(req, res);
    case 'test':
      return handleNotificationsTest(req, res);
    case 'dispatch-event':
      return handleNotificationsDispatchEvent(req, res);
    case 'dispatch-pending':
      return handleNotificationsDispatchPending(req, res);
    default:
      res.status(404).json({ error: `Unknown notifications action: ${action}` });
  }
}
