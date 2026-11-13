export async function readRawBody(req: any): Promise<string> {
  if (typeof req.rawBody === 'string') return req.rawBody;
  if (Buffer.isBuffer(req.rawBody)) return req.rawBody.toString('utf8');
  if (typeof req.body === 'string') return req.body;
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8');

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}

export async function readJson(req: any): Promise<any> {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return req.body;
  }
  const raw = await readRawBody(req);
  return raw ? JSON.parse(raw) : {};
}

export function resolveDynamicParam(
  req: any,
  paramName: string,
  routePrefix: string
): string {
  const fromParams = req.params?.[paramName];
  if (typeof fromParams === 'string' && fromParams.trim()) {
    return fromParams.trim().toLowerCase();
  }

  const fromQuery = req.query?.[paramName];
  if (typeof fromQuery === 'string' && fromQuery.trim()) {
    return fromQuery.trim().toLowerCase();
  }
  if (Array.isArray(fromQuery) && typeof fromQuery[0] === 'string' && fromQuery[0].trim()) {
    return fromQuery[0].trim().toLowerCase();
  }

  const rawUrl = String(req.originalUrl || req.url || '');
  const pathname = rawUrl.split('?')[0];
  const prefix = `/api/${routePrefix}/`;
  const idx = pathname.indexOf(prefix);
  if (idx !== -1) {
    const rest = pathname.slice(idx + prefix.length).split('/')[0];
    if (rest) return rest.trim().toLowerCase();
  }

  return '';
}
