import { resolveDynamicParam } from '../_lib/http.js';
import {
  handleSmsConfig,
  handleSmsSend,
  handleSmsTest,
} from '../_lib/handlers/sms.js';

export default async function handler(req: any, res: any) {
  const action = resolveDynamicParam(req, 'action', 'sms');

  switch (action) {
    case 'config':
      return handleSmsConfig(req, res);
    case 'test':
      return handleSmsTest(req, res);
    case 'send':
      return handleSmsSend(req, res);
    default:
      res.status(404).json({ error: 'Not found' });
      return;
  }
}
