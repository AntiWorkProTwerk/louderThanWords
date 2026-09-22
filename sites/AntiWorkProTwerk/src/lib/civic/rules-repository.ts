import { z } from 'zod';
import { checksum, ruleTextSchema, rulesDataSchema } from './rules';
async function verified(response: Response, expected: string) {
  if (!response.ok) throw new Error('Rule artifact unavailable');
  const raw = await response.json();
  const bytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(raw)),
  );
  const actual = Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
  if (actual !== expected) throw new Error('Rule artifact integrity check failed');
  return raw;
}
export async function loadRules(fetcher: typeof fetch, base = '') {
  const response = await fetcher(`${base}/data/rules/manifest.json`, { cache: 'no-cache' });
  if (!response.ok) throw new Error('Rule index unavailable');
  const manifest = z
    .object({
      formatVersion: z.literal(1),
      release: z.string().regex(/^rr-[a-f0-9]{24}$/),
      dataHash: checksum,
      publishedAt: z.string().datetime(),
    })
    .parse(await response.json());
  if (manifest.release !== `rr-${manifest.dataHash.slice(0, 24)}`)
    throw new Error('Invalid rule release identity');
  return {
    manifest,
    data: rulesDataSchema.parse(
      await verified(
        await fetcher(`${base}/data/rules/releases/${manifest.release}/data.json`),
        manifest.dataHash,
      ),
    ),
  };
}
export async function loadRuleText(
  fetcher: typeof fetch,
  documentId: string,
  textHash: string,
  base = '',
  signal?: AbortSignal,
) {
  checksum.parse(textHash);
  const text = ruleTextSchema.parse(
    await verified(
      await fetcher(`${base}/data/rules/texts/${textHash}.json`, { signal }),
      textHash,
    ),
  );
  if (text.documentId !== documentId) throw new Error('Rule text identity mismatch');
  return text;
}
