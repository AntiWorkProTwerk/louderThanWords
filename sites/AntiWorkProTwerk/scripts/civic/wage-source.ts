import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rename, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
export { inspectZip as inspectWageArchive, scanZipCsv as scanWageCsv } from './zip-csv';
import { hash } from '../said-did/engine';
import { withLock, writeAtomic } from '../said-did/pipeline';

export const wageArchiveUrl =
  'https://data.dol.gov/data-catalog/WHD/enforcement/WHD_enforcement.zip';
export const wageMetadataUrl = 'https://apiprod.dol.gov/v4/datasets/10362';
export const wageSourceUrl = 'https://data.dol.gov/datasets/10362';
const MAX_ARCHIVE = 350_000_000;
export async function fileHash(file: string) {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(file)) digest.update(chunk);
  return digest.digest('hex');
}
export async function acquireWageSource(workspace: string, offline = false) {
  return withLock(join(workspace, 'source-lock'), async () => {
    if (offline) {
      const receipt = JSON.parse(await readFile(join(workspace, 'source.json'), 'utf8'));
      if (receipt.url !== wageArchiveUrl || !/^[a-f0-9]{64}$/.test(receipt.hash))
        throw new Error('Invalid WHD source receipt');
      const path = join(workspace, 'raw', `${receipt.hash}.zip`);
      if ((await stat(path)).size > MAX_ARCHIVE || (await fileHash(path)) !== receipt.hash)
        throw new Error('WHD archive integrity failure');
      if (
        hash(receipt.metadata.raw) !== receipt.metadata.hash ||
        receipt.metadata.url !== wageMetadataUrl
      )
        throw new Error('WHD metadata integrity failure');
      return { ...receipt, path };
    }
    await mkdir(join(workspace, 'raw'), { recursive: true });
    // This is the portal's public bulk link; no API key or registered endpoint is used.
    const metadataResponse = await fetch(wageMetadataUrl, {
      redirect: 'error',
      signal: AbortSignal.timeout(30000),
    });
    if (!metadataResponse.ok) throw new Error(`WHD metadata HTTP ${metadataResponse.status}`);
    const metadataRaw = await metadataResponse.text();
    if (
      metadataRaw.length > 1_000_000 ||
      !metadataResponse.headers.get('content-type')?.includes('json')
    )
      throw new Error('Invalid WHD metadata response');
    const metadata = JSON.parse(metadataRaw).dataset;
    if (
      metadata.id !== 10362 ||
      metadata.agency?.abbr !== 'WHD' ||
      metadata.api_url !== 'enforcement'
    )
      throw new Error('WHD dataset identity changed');
    const response = await fetch(wageArchiveUrl, {
      redirect: 'error',
      signal: AbortSignal.timeout(300000),
    });
    if (!response.ok || !response.body) throw new Error(`WHD bulk HTTP ${response.status}`);
    const declared = Number(response.headers.get('content-length'));
    if (declared > MAX_ARCHIVE || response.headers.get('content-type')?.includes('html')) {
      await response.body.cancel();
      throw new Error('WHD archive exceeds cap or returned HTML');
    }
    const path = join(workspace, 'raw', `download-${randomUUID()}.partial`),
      digest = createHash('sha256');
    let bytes = 0;
    await pipeline(
      Readable.fromWeb(response.body as never),
      new Transform({
        transform(chunk, _encoding, callback) {
          bytes += chunk.length;
          if (bytes > MAX_ARCHIVE) return callback(new Error('WHD archive exceeds 350 MB'));
          digest.update(chunk);
          callback(null, chunk);
        },
      }),
      createWriteStream(path, { flags: 'wx' }),
    );
    if (declared && declared !== bytes) throw new Error('Incomplete WHD archive download');
    const checksum = digest.digest('hex'),
      destination = join(workspace, 'raw', `${checksum}.zip`);
    // A complete byte-identical source capture may safely replace its content-addressed cache file.
    await rename(path, destination);
    const receipt = {
      url: wageArchiveUrl,
      hash: checksum,
      bytes,
      observedAt: new Date().toISOString(),
      lastModified: response.headers.get('last-modified'),
      etag: response.headers.get('etag'),
      metadata: { url: wageMetadataUrl, raw: metadataRaw, hash: hash(metadataRaw) },
    };
    await writeAtomic(join(workspace, 'source.json'), receipt);
    return { ...receipt, path: destination };
  });
}
