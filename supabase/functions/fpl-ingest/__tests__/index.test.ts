import { assertEquals } from '@std/assert';
import { handler } from '../index.ts';

Deno.test('returns 400 when source query param is missing', async () => {
  const req = new Request('http://localhost/functions/v1/fpl-ingest');
  const res = await handler(req);
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error, 'missing or invalid ?source= (expected bootstrap|fixtures)');
});

Deno.test('returns 400 when source query param is unrecognised', async () => {
  const req = new Request('http://localhost/functions/v1/fpl-ingest?source=garbage');
  const res = await handler(req);
  assertEquals(res.status, 400);
});
