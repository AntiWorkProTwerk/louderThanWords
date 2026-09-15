import { z } from 'zod';
import { identifier, stateCode } from '../data/schema';
import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';

export type AppEnv = {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_PRICE_ID?: string;
  PUBLIC_APP_URL?: string;
};
const savedInput = z.object({
  politician_id: identifier,
  name: z.string().min(1).max(120),
  state: stateCode,
  note: z.string().max(2000).default(''),
});
const preferencesInput = z
  .object({ state: stateCode.optional(), party: z.enum(['all', 'R', 'D', 'I']).optional() })
  .strict();
const json = (data: unknown, status = 200) =>
  Response.json(data, {
    status,
    headers: {
      'Cache-Control': 'private, no-store',
      Vary: 'Authorization, Cookie',
      'X-Content-Type-Options': 'nosniff',
    },
  });
const configured = (env: AppEnv) => !!(env.SUPABASE_URL && env.SUPABASE_ANON_KEY);
const billingConfigured = (env: AppEnv) =>
  !!(
    configured(env) &&
    env.STRIPE_SECRET_KEY &&
    env.STRIPE_PRICE_ID &&
    env.PUBLIC_APP_URL &&
    env.STRIPE_WEBHOOK_SECRET &&
    env.SUPABASE_SERVICE_ROLE_KEY
  );
async function readLimited(request: Request, limit: number) {
  if (Number(request.headers.get('Content-Length')) > limit)
    throw new HttpError(413, 'Request body is too large.');
  const reader = request.body?.getReader();
  if (!reader) return '';
  const decoder = new TextDecoder();
  let size = 0,
    text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new HttpError(413, 'Request body is too large.');
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}
async function body(request: Request) {
  const text = await readLimited(request, 16_384);
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, 'Invalid JSON.');
  }
}
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
async function authenticate(request: Request, env: AppEnv) {
  const token = request.headers.get('Authorization')?.match(/^Bearer (.+)$/)?.[1];
  if (!token) throw new HttpError(401, 'Please sign in to continue.');
  if (!configured(env)) throw new HttpError(503, 'Accounts are not connected yet.');
  const { createClient } = await import('@supabase/supabase-js');
  const db = createClient(env.SUPABASE_URL!, env.SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user)
    throw new HttpError(401, 'Your session has expired. Please sign in again.');
  return { db, user: data.user };
}
async function subscription(db: SupabaseClient, userId: string) {
  const { data, error } = await db
    .from('subscriptions')
    .select('status,customer_id,current_period_end')
    .eq('user_id', userId)
    .order('event_created', { ascending: false });
  if (error) throw new HttpError(503, 'Subscription records are temporarily unavailable.');
  const current = data?.find(
    (s) =>
      ['active', 'trialing'].includes(s.status) &&
      new Date(s.current_period_end).getTime() > Date.now(),
  );
  return {
    status: current?.status ?? 'free',
    customerId: current?.customer_id ?? data?.[0]?.customer_id,
  };
}
async function stripeClient(env: AppEnv) {
  const { default: StripeClient } = await import('stripe');
  return new StripeClient(env.STRIPE_SECRET_KEY!, {
    httpClient: StripeClient.createFetchHttpClient(),
    maxNetworkRetries: 2,
  });
}
export function acceptsSubscriptionUpdate(previous: number, incoming: number) {
  return incoming >= previous;
}
async function webhook(request: Request, env: AppEnv) {
  if (
    !env.STRIPE_SECRET_KEY ||
    !env.STRIPE_WEBHOOK_SECRET ||
    !env.SUPABASE_SERVICE_ROLE_KEY ||
    !env.SUPABASE_URL
  )
    throw new HttpError(503, 'Billing webhooks are not configured.');
  const signature = request.headers.get('stripe-signature');
  if (!signature) throw new HttpError(400, 'Missing webhook signature.');
  const raw = await readLimited(request, 1_048_576);
  const stripe = await stripeClient(env);
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(raw, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch {
    throw new HttpError(400, 'Invalid webhook signature.');
  }
  let subscriptionId: string | undefined;
  if (event.type.startsWith('customer.subscription.'))
    subscriptionId = (event.data.object as Stripe.Subscription).id;
  else if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    subscriptionId =
      typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
  }
  if (!subscriptionId) return json({ received: true });
  // Read Stripe's current object rather than granting access from an old event's payload.
  const current = await stripe.subscriptions.retrieve(subscriptionId);
  const userId = z.string().uuid().safeParse(current.metadata.user_id);
  if (!userId.success) throw new HttpError(400, 'Subscription has no valid account mapping.');
  const { createClient } = await import('@supabase/supabase-js');
  const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const customerId = typeof current.customer === 'string' ? current.customer : current.customer.id;
  const periodEnd = Math.max(...current.items.data.map((item) => item.current_period_end), 0);
  const { error } = await db.rpc('record_subscription_event', {
    p_event_id: event.id,
    p_event_created: event.created,
    p_subscription_id: current.id,
    p_user_id: userId.data,
    p_customer_id: customerId,
    p_status: current.status,
    p_period_end: new Date(periodEnd * 1000).toISOString(),
  });
  if (error) throw new HttpError(503, 'Webhook storage failed. Please retry.');
  return json({ received: true });
}
export async function handleApi(request: Request, env: AppEnv, path: string): Promise<Response> {
  try {
    path = path.replace(/^\/+|\/+$/g, '');
    if (path === 'config' && request.method === 'GET')
      return json({
        configured: configured(env),
        billingConfigured: billingConfigured(env),
        ...(configured(env)
          ? { supabaseUrl: env.SUPABASE_URL, supabaseAnonKey: env.SUPABASE_ANON_KEY }
          : {}),
      });
    if (path === 'billing/webhook' && request.method === 'POST') return await webhook(request, env);
    const origin = request.headers.get('Origin');
    if (origin && origin !== new URL(request.url).origin)
      throw new HttpError(403, 'Cross-origin account requests are not allowed.');
    if (
      !['account', 'saved', 'preferences', 'billing/checkout', 'billing/portal'].includes(path) &&
      !/^premium\/[a-z0-9-]+$/.test(path)
    )
      return json({ error: 'Endpoint not found.' }, 404);
    const { db, user } = await authenticate(request, env);
    if (path === 'account' && request.method === 'GET') {
      const plan = await subscription(db, user.id);
      return json({
        email: user.email,
        subscription: plan.status,
        billingConfigured: billingConfigured(env),
      });
    }
    if (path === 'saved') {
      if (request.method === 'GET') {
        const { data, error } = await db
          .from('saved_politicians')
          .select('politician_id,name,state,note')
          .eq('user_id', user.id)
          .order('updated_at', { ascending: false });
        if (error) throw new HttpError(503, 'Saved items could not be loaded.');
        return json({ items: data });
      }
      if (request.method === 'PUT') {
        const item = savedInput.parse(await body(request));
        const { error } = await db
          .from('saved_politicians')
          .upsert(
            { ...item, user_id: user.id, updated_at: new Date().toISOString() },
            { onConflict: 'user_id,politician_id' },
          );
        if (error) throw new HttpError(503, 'Saved item could not be updated.');
        return json({ saved: true });
      }
      if (request.method === 'DELETE') {
        const { politician_id } = z
          .object({ politician_id: identifier })
          .parse(await body(request));
        const { error } = await db
          .from('saved_politicians')
          .delete()
          .eq('user_id', user.id)
          .eq('politician_id', politician_id);
        if (error) throw new HttpError(503, 'Saved item could not be removed.');
        return json({ removed: true });
      }
    }
    if (path === 'preferences') {
      if (request.method === 'GET') {
        const { data, error } = await db
          .from('preferences')
          .select('settings')
          .eq('user_id', user.id)
          .maybeSingle();
        if (error) throw new HttpError(503, 'Preferences unavailable.');
        return json(data?.settings ?? {});
      }
      if (request.method === 'PUT') {
        const settings = preferencesInput.parse(await body(request));
        const { error } = await db.from('preferences').upsert({ user_id: user.id, settings });
        if (error) throw new HttpError(503, 'Preferences could not be saved.');
        return json(settings);
      }
    }
    if (path.startsWith('premium/') && request.method === 'GET') {
      const plan = await subscription(db, user.id);
      if (!['active', 'trialing'].includes(plan.status))
        throw new HttpError(403, 'A supporter subscription is required.');
      const { data, error } = await db
        .from('premium_analysis')
        .select('analysis')
        .eq('politician_id', identifier.parse(path.slice(8)))
        .maybeSingle();
      if (error) throw new HttpError(503, 'Analysis is temporarily unavailable.');
      if (!data)
        throw new HttpError(
          404,
          'No subscriber analysis has been published for this representative.',
        );
      return json(data);
    }
    if ((path === 'billing/checkout' || path === 'billing/portal') && request.method === 'POST') {
      if (!billingConfigured(env)) throw new HttpError(503, 'Subscriptions are not connected yet.');
      const stripe = await stripeClient(env),
        plan = await subscription(db, user.id),
        appUrl = new URL(env.PUBLIC_APP_URL!);
      if (appUrl.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(appUrl.hostname))
        throw new HttpError(503, 'Billing return URL is invalid.');
      appUrl.search = '?panel=account';
      if (path === 'billing/portal') {
        if (!plan.customerId) throw new HttpError(409, 'No billing account exists yet.');
        const session = await stripe.billingPortal.sessions.create({
          customer: plan.customerId,
          return_url: appUrl.href,
        });
        return json({ url: session.url });
      }
      if (['active', 'trialing'].includes(plan.status))
        throw new HttpError(409, 'You already have a subscription. Use Manage subscription.');
      const session = await stripe.checkout.sessions.create(
        {
          mode: 'subscription',
          line_items: [{ price: env.STRIPE_PRICE_ID!, quantity: 1 }],
          client_reference_id: user.id,
          subscription_data: { metadata: { user_id: user.id } },
          ...(plan.customerId ? { customer: plan.customerId } : { customer_email: user.email }),
          success_url: appUrl.href,
          cancel_url: appUrl.href,
        },
        { idempotencyKey: `checkout-${user.id}-${Math.floor(Date.now() / 300000)}` },
      );
      return json({ url: session.url });
    }
    return json({ error: 'Method not allowed.' }, 405);
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message }, error.status);
    if (error instanceof z.ZodError)
      return json({ error: 'The request contains invalid fields.' }, 400);
    return json({ error: 'The service is temporarily unavailable. Please try again.' }, 503);
  }
}
