import { resolveDynamicParam } from '../_lib/http.js';
import {
  handleCronExpireSubscriptions,
  handleCronProcessReminders,
} from '../_lib/handlers/cron.js';

export default async function handler(req: any, res: any) {
  const job = resolveDynamicParam(req, 'job', 'cron');

  switch (job) {
    case 'process-reminders':
      return handleCronProcessReminders(req, res);
    case 'expire-subscriptions':
      return handleCronExpireSubscriptions(req, res);
    default:
      res.status(404).json({ error: 'Not found' });
      return;
  }
}
