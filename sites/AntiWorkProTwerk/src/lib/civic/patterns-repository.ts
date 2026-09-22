import { patternsDataSchema } from './patterns';
export async function loadPatterns(fetcher: typeof fetch, base = '', pinned?: string | null) {
  let release = pinned,
    expected: string | null = null;
  if (!release) {
    const response = await fetcher(`${base}/data/patterns/manifest.json`, { cache: 'no-cache' });
    if (!response.ok) throw new Error('Patterns index unavailable');
    const manifest = await response.json();
    if (manifest.formatVersion !== 1 || !/^[a-f0-9]{64}$/.test(manifest.dataHash))
      throw new Error('Invalid patterns manifest');
    release = manifest.release;
    expected = manifest.dataHash;
  }
  if (!release || !/^pt-[a-f0-9]{24}$/.test(release)) throw new Error('Invalid patterns release');
  const response = await fetcher(`${base}/data/patterns/releases/${release}/data.json`);
  if (!response.ok) throw new Error('Frozen patterns unavailable');
  const raw = await response.json();
  const dataHash = Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(raw))),
    ),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('');
  if (release !== `pt-${dataHash.slice(0, 24)}` || (expected && expected !== dataHash))
    throw new Error('Patterns integrity check failed');
  return { release, dataHash, data: patternsDataSchema.parse(raw) };
}
