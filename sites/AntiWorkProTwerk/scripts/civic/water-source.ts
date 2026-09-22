import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, rename, stat } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { z } from 'zod';
import { writeAtomic, withLock } from '../said-did/pipeline';

export const waterArchiveUrl = 'https://echo.epa.gov/files/echodownloads/SDWA_latest_downloads.zip';
export const waterSearchUrl =
  'https://echo.epa.gov/files/echodownloads/SDWA_system_search_download.zip';
export const waterSourceSchema = z.object({
  url: z.enum([waterArchiveUrl, waterSearchUrl]),
  hash: z.string().regex(/^[a-f0-9]{64}$/),
  bytes: z.number().int().positive().max(1_000_000_000),
  observedAt: z.string().datetime(),
  lastModified: z.string().nullable(),
  etag: z.string().nullable(),
});
export async function waterFileHash(path: string) {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(path)) digest.update(chunk);
  return digest.digest('hex');
}
export async function acquireWaterSource(
  workspace: string,
  offline = false,
  fetcher: typeof fetch = fetch,
  searchArchive = false,
) {
  const receiptName = searchArchive ? 'search-source.json' : 'source.json',
    url = searchArchive ? waterSearchUrl : waterArchiveUrl;
  return withLock(
    join(workspace, searchArchive ? 'search-source-lock' : 'source-lock'),
    async () => {
      if (offline) {
        const receipt = waterSourceSchema.parse(
            JSON.parse(await readFile(join(workspace, receiptName), 'utf8')),
          ),
          path = join(workspace, 'raw', `${receipt.hash}.zip`);
        if (
          receipt.url !== url ||
          (await stat(path)).size !== receipt.bytes ||
          (await waterFileHash(path)) !== receipt.hash
        )
          throw new Error('SDWA archive integrity failure');
        return { ...receipt, path };
      }
      await mkdir(join(workspace, 'raw'), { recursive: true });
      const response = await fetcher(url, {
        redirect: 'error',
        signal: AbortSignal.timeout(600000),
      });
      if (response.status !== 200 || !response.body)
        throw new Error(`SDWA archive HTTP ${response.status}`);
      const declared = Number(response.headers.get('content-length'));
      if (declared > 1_000_000_000 || response.headers.get('content-type')?.includes('html')) {
        await response.body.cancel();
        throw new Error('SDWA archive size/type rejected');
      }
      const pending = join(workspace, 'raw', `download-${randomUUID()}.partial`),
        digest = createHash('sha256');
      let bytes = 0;
      await pipeline(
        Readable.fromWeb(response.body as never),
        new Transform({
          transform(chunk, _encoding, callback) {
            bytes += chunk.length;
            if (bytes > 1_000_000_000) return callback(new Error('SDWA archive exceeds 1 GB'));
            digest.update(chunk);
            callback(null, chunk);
          },
        }),
        createWriteStream(pending, { flags: 'wx' }),
      );
      if (declared && declared !== bytes) throw new Error('Incomplete SDWA archive');
      const hash = digest.digest('hex'),
        path = join(workspace, 'raw', `${hash}.zip`);
      await rename(pending, path);
      const receipt = waterSourceSchema.parse({
        url,
        hash,
        bytes,
        observedAt: new Date().toISOString(),
        lastModified: response.headers.get('last-modified'),
        etag: response.headers.get('etag'),
      });
      await writeAtomic(join(workspace, receiptName), receipt);
      return { ...receipt, path };
    },
  );
}
