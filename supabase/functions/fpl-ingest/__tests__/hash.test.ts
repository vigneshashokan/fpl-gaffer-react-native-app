import { assert, assertEquals, assertNotEquals } from '@std/assert';
import { sha256Hex } from '../lib/hash.ts';

Deno.test('sha256Hex is deterministic for identical inputs', async () => {
  const a = await sha256Hex('hello');
  const b = await sha256Hex('hello');
  assertEquals(a, b);
});

Deno.test('sha256Hex differs for distinct inputs', async () => {
  const a = await sha256Hex('hello');
  const b = await sha256Hex('hello!');
  assertNotEquals(a, b);
});

Deno.test('sha256Hex returns 64-char lowercase hex', async () => {
  const h = await sha256Hex('hello');
  assertEquals(h.length, 64);
  assert(/^[0-9a-f]+$/.test(h), `expected lowercase hex, got ${h}`);
});

Deno.test('sha256Hex of empty string matches the known SHA-256 of ""', async () => {
  const h = await sha256Hex('');
  assertEquals(h, 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
});
