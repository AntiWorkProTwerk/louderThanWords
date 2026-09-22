import { createReadStream, createWriteStream } from 'node:fs';
import { readFile, mkdir, rename, stat } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { setTimeout as pause } from 'node:timers/promises';
import { z } from 'zod';
import { writeAtomic, withLock } from '../said-did/pipeline';
export const secSourceSchema = z.object({
  url: z.string().url(),
  hash: z.string().regex(/^[a-f0-9]{64}$/),
  bytes: z.number().int().positive(),
  observedAt: z.string().datetime(),
  lastModified: z.string().nullable(),
});
async function fileHash(path: string) {
  const h = createHash('sha256');
  for await (const chunk of createReadStream(path)) h.update(chunk);
  return h.digest('hex');
}
let requestQueue = Promise.resolve();
function pacedFetch(fetcher: typeof fetch, url: string, headers: Record<string, string>) {
  const work = requestQueue.then(async () => {
    await pause(550); // All requests from this adapter are serialized below two starts/second.
    return fetcher(url, { headers, redirect: 'error', signal: AbortSignal.timeout(120000) });
  });
  requestQueue = work.then(
    () => undefined,
    () => undefined,
  );
  return work;
}
export async function acquireSecFile(
  workspace: string,
  request: { url: string; key: string; extension: 'zip' | 'json' | 'xml' | 'html'; cap: number },
  offline = false,
  fetcher: typeof fetch = fetch,
) {
  const { url, key, extension, cap } = request;
  const parsed = new URL(url);
  if (
    !['https://www.sec.gov', 'https://dcm.sec.gov', 'https://data.sec.gov'].includes(
      parsed.origin,
    ) ||
    parsed.username ||
    parsed.password ||
    parsed.hash ||
    parsed.search ||
    !/^[a-z0-9-]+$/.test(key) ||
    !Number.isSafeInteger(cap) ||
    cap <= 0
  )
    throw new Error('Invalid SEC source request');
  if (!['zip', 'json', 'xml', 'html'].includes(extension))
    throw new Error('Invalid SEC source format');
  return withLock(join(workspace, `source-${key}`), async () => {
    const receiptPath = join(workspace, 'receipts', `${key}.json`);
    if (offline) {
      const source = secSourceSchema.parse(JSON.parse(await readFile(receiptPath, 'utf8'))),
        path = join(workspace, 'raw', `${source.hash}.${extension}`);
      if (
        source.url !== url ||
        source.bytes > cap ||
        (await stat(path)).size !== source.bytes ||
        (await fileHash(path)) !== source.hash
      )
        throw new Error('SEC source integrity failure');
      return { source, path };
    }
    const agent =
      process.env.SEC_USER_AGENT ??
      'LouderThanWords/0.1 (local public-data research; https://louderthanwords.fyi)';
    if (/[\r\n]/.test(agent) || agent.length < 8) throw new Error('Invalid SEC user agent');
    const response = await pacedFetch(fetcher, url, {
      'User-Agent': agent,
      'Accept-Encoding': 'identity',
      Accept: {
        zip: 'application/zip',
        json: 'application/json',
        xml: 'application/xml,text/xml',
        html: 'text/html',
      }[extension],
    });
    if (response.status !== 200 || !response.body) {
      await response.body?.cancel();
      throw new Error(
        `SEC source HTTP ${response.status}; no partial publication. Retry later if rate limited.`,
      );
    }
    const declared = Number(response.headers.get('content-length'));
    if (
      declared > cap ||
      (extension !== 'html' && response.headers.get('content-type')?.includes('html'))
    ) {
      await response.body.cancel();
      throw new Error('SEC source size/type rejected');
    }
    await mkdir(join(workspace, 'raw'), { recursive: true });
    const pending = join(workspace, 'raw', `download-${randomUUID()}.partial`),
      h = createHash('sha256');
    let bytes = 0;
    await pipeline(
      Readable.fromWeb(response.body as never),
      new Transform({
        transform(chunk, _encoding, callback) {
          bytes += chunk.length;
          if (bytes > cap) return callback(new Error('SEC source exceeds cap'));
          h.update(chunk);
          callback(null, chunk);
        },
      }),
      createWriteStream(pending, { flags: 'wx' }),
    );
    // Fetch decodes HTTP content encoding. Content-Length then describes transport
    // bytes, not this decoded body; the stream enforces truncation during decoding.
    const encoding = response.headers.get('content-encoding');
    if (declared && (!encoding || encoding === 'identity') && declared !== bytes)
      throw new Error('Incomplete SEC source');
    const hash = h.digest('hex'),
      path = join(workspace, 'raw', `${hash}.${extension}`);
    await rename(pending, path);
    const source = secSourceSchema.parse({
      url,
      hash,
      bytes,
      observedAt: new Date().toISOString(),
      lastModified: response.headers.get('last-modified'),
    });
    await writeAtomic(receiptPath, source);
    return { source, path };
  });
}
