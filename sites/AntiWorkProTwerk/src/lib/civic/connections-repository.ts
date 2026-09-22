import { connectionsDataSchema } from './connections';
export async function loadConnections(fetcher: typeof fetch, base = '') {
  const response = await fetcher(`${base}/data/connections/manifest.json`, { cache: 'no-cache' });
  if (!response.ok) throw new Error('Connection collection unavailable');
  const manifest = await response.json();
  if (
    !/^cn-[a-f0-9]{24}$/.test(manifest.release) ||
    !/^[a-f0-9]{64}$/.test(manifest.dataHash) ||
    manifest.release !== `cn-${manifest.dataHash.slice(0, 24)}`
  )
    throw new Error('Invalid connection release');
  const file = await fetcher(`${base}/data/connections/releases/${manifest.release}/data.json`);
  if (!file.ok) throw new Error('Connection evidence unavailable');
  const raw = await file.json();
  const digest = Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(raw))),
    ),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('');
  if (digest !== manifest.dataHash) throw new Error('Connection evidence failed verification');
  return { release: manifest.release as string, data: connectionsDataSchema.parse(raw) };
}
