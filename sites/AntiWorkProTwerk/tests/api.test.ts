import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleApi } from '../src/lib/server/api';

test('account configuration exposes only public configuration', async () => {
  const response = await handleApi(
    new Request('https://example.test/api/config'),
    {
      SUPABASE_URL: 'https://db.example.test',
      SUPABASE_ANON_KEY: 'public-key',
      SUPABASE_SERVICE_ROLE_KEY: 'private-secret',
      STRIPE_SECRET_KEY: 'stripe-secret',
    },
    'config',
  );
  const text = await response.text();
  assert.ok(text.includes('public-key'));
  assert.ok(!text.includes('private-secret'));
  assert.ok(!text.includes('stripe-secret'));
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
});
test('every private endpoint requires authentication, including premium data', async () => {
  for (const path of [
    'saved',
    'preferences',
    'account',
    'premium/cruz',
    'billing/checkout',
    'billing/portal',
  ]) {
    const response = await handleApi(new Request(`https://example.test/api/${path}`), {}, path);
    assert.equal(response.status, 401, path);
    assert.match(response.headers.get('Cache-Control') ?? '', /no-store/);
  }
});
test('webhooks reject invalid signatures and missing configuration', async () => {
  const disabled = await handleApi(
    new Request('https://example.test/api/billing/webhook', { method: 'POST', body: '{}' }),
    {},
    'billing/webhook',
  );
  assert.equal(disabled.status, 503);
  const invalid = await handleApi(
    new Request('https://example.test/api/billing/webhook', {
      method: 'POST',
      headers: { 'stripe-signature': 't=1,v1=invalid' },
      body: '{}',
    }),
    {
      STRIPE_SECRET_KEY: 'sk_test_fake',
      STRIPE_WEBHOOK_SECRET: 'whsec_fake',
      SUPABASE_SERVICE_ROLE_KEY: 'test',
      SUPABASE_URL: 'https://db.example.test',
    },
    'billing/webhook',
  );
  assert.equal(invalid.status, 400);
});
test('cross-origin private writes are rejected', async () => {
  const response = await handleApi(
    new Request('https://example.test/api/saved', {
      method: 'PUT',
      headers: { Origin: 'https://other.test' },
      body: '{}',
    }),
    {},
    'saved',
  );
  assert.equal(response.status, 403);
});
