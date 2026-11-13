import { resolveDynamicParam } from '../_lib/http.js';
import {
  handleFeedbackSubmit,
  handleFeedbackValidate,
} from '../_lib/handlers/feedback.js';

export default async function handler(req: any, res: any) {
  const action = resolveDynamicParam(req, 'action', 'feedback');

  switch (action) {
    case 'validate':
      return handleFeedbackValidate(req, res);
    case 'submit':
      return handleFeedbackSubmit(req, res);
    default:
      res.status(404).json({ error: 'Not found' });
      return;
  }
}
