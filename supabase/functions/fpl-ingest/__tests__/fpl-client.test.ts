import { assert, assertEquals, assertRejects } from '@std/assert';
import { fetchJson } from '../lib/fpl-client.ts';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.test('fetchJson returns parsed JSON on 200', async () => {
  const stubFetch: typeof fetch = () => Promise.resolve(jsonResponse({ ok: true }));
  const body = await fetchJson<{ ok: boolean }>('https://example.com/data', {
    fetch: stubFetch,
  });
  assertEquals(body.ok, true);
});

Deno.test('fetchJson retries once on 500 then succeeds', async () => {
  let calls = 0;
  const stubFetch: typeof fetch = () => {
    calls++;
    return Promise.resolve(
      calls === 1 ? jsonResponse({}, 500) : jsonResponse({ ok: true }, 200),
    );
  };
  const body = await fetchJson<{ ok: boolean }>('https://example.com/data', {
    fetch: stubFetch,
    retryDelayMs: 0,
  });
  assertEquals(calls, 2);
  assertEquals(body.ok, true);
});

Deno.test('fetchJson throws after two 5xx attempts', async () => {
  let calls = 0;
  const stubFetch: typeof fetch = () => {
    calls++;
    return Promise.resolve(jsonResponse({}, 503));
  };
  await assertRejects(
    () => fetchJson('https://example.com/data', { fetch: stubFetch, retryDelayMs: 0 }),
    Error,
    'FPL fetch failed: 503',
  );
  assertEquals(calls, 2);
});

Deno.test('fetchJson does NOT retry 4xx errors', async () => {
  let calls = 0;
  const stubFetch: typeof fetch = () => {
    calls++;
    return Promise.resolve(jsonResponse({ err: 'nope' }, 404));
  };
  await assertRejects(
    () => fetchJson('https://example.com/data', { fetch: stubFetch, retryDelayMs: 0 }),
    Error,
    'FPL fetch failed: 404',
  );
  assertEquals(calls, 1);
});

Deno.test('fetchJson aborts when timeout exceeded', async () => {
  const stubFetch: typeof fetch = (_url, init) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(new DOMException('aborted', 'AbortError'));
      });
    });
  let threw = false;
  try {
    await fetchJson('https://example.com/data', {
      fetch: stubFetch,
      timeoutMs: 10,
      retryDelayMs: 0,
    });
  } catch (e) {
    threw = true;
    assert(e instanceof Error);
  }
  assertEquals(threw, true);
});
