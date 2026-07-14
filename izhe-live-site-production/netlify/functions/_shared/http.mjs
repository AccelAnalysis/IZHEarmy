export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...extraHeaders
    }
  });
}

export function methodNotAllowed(allowed) {
  return json({ error: 'Method not allowed.' }, 405, { allow: allowed.join(', ') });
}

export function cleanText(value, max = 200) {
  return String(value ?? '').trim().replace(/[\u0000-\u001F\u007F]/g, '').slice(0, max);
}

export function requireFields(payload, fields) {
  for (const field of fields) {
    if (!cleanText(payload[field])) throw new Error(`Missing required field: ${field}.`);
  }
}
