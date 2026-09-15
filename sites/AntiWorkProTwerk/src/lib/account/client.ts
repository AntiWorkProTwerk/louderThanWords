import { base } from '$app/paths';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { identifier, stateCode } from '$lib/data/schema';

export const savedSchema = z.object({
  politician_id: identifier,
  name: z.string().max(120),
  state: stateCode,
  note: z.string().max(2000).default(''),
});
export type SavedItem = z.infer<typeof savedSchema>;
type Config = {
  configured: boolean;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  billingConfigured: boolean;
};
let authPromise: Promise<SupabaseClient | null> | undefined;
export async function getAuth() {
  if (!authPromise)
    authPromise = (async () => {
      const response = await fetch(`${base}/api/config`);
      if (!response.ok)
        throw new Error('Account services are unavailable. Please try again later.');
      const config: Config = await response.json();
      if (!config.configured) return null;
      const { createClient } = await import('@supabase/supabase-js');
      return createClient(config.supabaseUrl!, config.supabaseAnonKey!, {
        auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true },
      });
    })().catch((error) => {
      authPromise = undefined;
      throw error;
    });
  return authPromise;
}
export async function accountRequest(path: string, init: RequestInit = {}) {
  const auth = await getAuth();
  const session = auth ? (await auth.auth.getSession()).data.session : null;
  if (!session) throw new Error('Please sign in to continue.');
  const response = await fetch(`${base}/api/${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      ...init.headers,
    },
    cache: 'no-store',
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? 'The request could not be completed.');
  return result;
}
const storageKey = 'ltw-demo-saved-v1';
export async function readSaved(): Promise<{ items: SavedItem[]; local: boolean }> {
  const auth = await getAuth();
  const session = auth ? (await auth.auth.getSession()).data.session : null;
  if (session) {
    const result = await accountRequest('saved');
    return { items: z.array(savedSchema).parse(result.items), local: false };
  }
  let stored: unknown = [];
  try {
    stored = JSON.parse(localStorage.getItem(storageKey) ?? '[]');
  } catch {}
  const parsed = z.array(savedSchema).safeParse(stored);
  return { items: parsed.success ? parsed.data : [], local: true };
}
export async function writeSaved(item: SavedItem, remove = false) {
  const current = await readSaved();
  if (current.local) {
    const items = current.items.filter((p) => p.politician_id !== item.politician_id);
    if (!remove) items.push(savedSchema.parse(item));
    localStorage.setItem(storageKey, JSON.stringify(items));
  } else
    await accountRequest('saved', {
      method: remove ? 'DELETE' : 'PUT',
      body: JSON.stringify(item),
    });
}
