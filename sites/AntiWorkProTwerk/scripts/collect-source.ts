import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { identifier } from '../src/lib/data/schema';

// An explicit, allowlisted source is required; this never runs from a visitor request.
export async function collectSource(options: {
  id: string;
  url: string;
  allowedHosts: string[];
  archiveDirectory: string;
  minIntervalMs: number;
  signal?: AbortSignal;
}) {
  identifier.parse(options.id);
  const url = new URL(options.url);
  if (url.protocol !== 'https:' || !options.allowedHosts.includes(url.hostname))
    throw new Error('Source URL is not allowlisted.');
  const directory = join(options.archiveDirectory, options.id);
  await mkdir(directory, { recursive: true });
  const checkpoint = join(directory, 'checkpoint.json');
  let previous: {
    etag?: string;
    lastModified?: string;
    requestedAt?: number;
    archiveKey?: string;
  } = {};
  try {
    previous = JSON.parse(await readFile(checkpoint, 'utf8'));
  } catch {}
  const wait = Math.max(0, (previous.requestedAt ?? 0) + options.minIntervalMs - Date.now());
  if (wait > 0)
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, wait);
      options.signal?.addEventListener(
        'abort',
        () => {
          clearTimeout(timer);
          reject(options.signal?.reason);
        },
        { once: true },
      );
    });
  const headers: Record<string, string> = { 'User-Agent': 'LouderThanWords-Data/1.0' };
  if (previous.etag) headers['If-None-Match'] = previous.etag;
  if (previous.lastModified) headers['If-Modified-Since'] = previous.lastModified;
  const response = await fetch(url, {
    headers,
    redirect: 'error',
    signal: options.signal ?? AbortSignal.timeout(30_000),
  });
  if (response.status === 304) {
    await writeFile(checkpoint, JSON.stringify({ ...previous, requestedAt: Date.now() }));
    return { changed: false, archiveKey: previous.archiveKey };
  }
  if (!response.ok)
    throw new Error(`Collection failed (${response.status}); last published release is unchanged.`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > 25_000_000) throw new Error('Source exceeded the 25 MB collection limit.');
  const digest = createHash('sha256').update(bytes).digest('hex'),
    archiveKey = `${options.id}/${digest}.raw`;
  await writeFile(join(directory, `${digest}.raw`), bytes);
  await writeFile(
    join(directory, `${digest}.source.json`),
    JSON.stringify({
      sourceId: options.id,
      sourceUrl: url.href,
      collectedAt: new Date().toISOString(),
      sha256: digest,
    }),
  );
  await writeFile(
    checkpoint,
    JSON.stringify({
      etag: response.headers.get('etag'),
      lastModified: response.headers.get('last-modified'),
      requestedAt: Date.now(),
      archiveKey,
    }),
  );
  return { changed: archiveKey !== previous.archiveKey, archiveKey };
}
