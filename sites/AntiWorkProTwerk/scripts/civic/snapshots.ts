import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { hash } from '../said-did/engine';
import { withLock } from '../said-did/pipeline';

export async function publishSnapshot(
  data: unknown,
  output: string,
  prefix: string,
  expectedRelease?: string | null,
  attachments: Record<string, unknown> = {},
) {
  if (!/^[a-z]{2,8}$/.test(prefix)) throw new Error('Invalid release namespace');
  for (const name of Object.keys(attachments))
    if (!/^[a-z0-9][a-z0-9/-]*\.json$/.test(name) || name.includes('//') || name === 'data.json')
      throw new Error('Invalid snapshot attachment path');
  return withLock(output, async () => {
    if (expectedRelease !== undefined) {
      let actual: string | null = null;
      try {
        actual = JSON.parse(await readFile(join(output, 'manifest.json'), 'utf8')).release;
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
      }
      if (actual !== expectedRelease)
        throw new Error('Publication changed during the job. Rerun against the latest snapshot.');
    }
    const dataHash = hash(data),
      release = `${prefix}-${dataHash.slice(0, 24)}`;
    const directory = join(output, 'releases', release);
    await mkdir(directory, { recursive: true });
    const file = join(directory, 'data.json'),
      payload = JSON.stringify(data);
    try {
      if ((await readFile(file, 'utf8')) !== payload)
        throw new Error('Immutable release content mismatch');
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
      const temp = join(directory, `data.${randomUUID()}.tmp`);
      await writeFile(temp, payload);
      await rename(temp, file);
    }
    // Write and verify every attachment before exposing any new manifest reference.
    const files: Record<string, string> = {};
    for (const [name, content] of Object.entries(attachments)) {
      const target = join(directory, name),
        serialized = JSON.stringify(content);
      files[name] = hash(content);
      await mkdir(dirname(target), { recursive: true });
      try {
        if ((await readFile(target, 'utf8')) !== serialized)
          throw new Error('Immutable attachment content mismatch');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        const pending = `${target}.${randomUUID()}.tmp`;
        await writeFile(pending, serialized);
        await rename(pending, target);
      }
    }
    const manifest = {
      formatVersion: 1,
      release,
      dataHash,
      publishedAt: new Date().toISOString(),
      ...(Object.keys(files).length ? { files } : {}),
    };
    const temp = join(output, `manifest.${randomUUID()}.tmp`);
    await writeFile(temp, JSON.stringify(manifest, null, 2));
    await rename(temp, join(output, 'manifest.json'));
    return manifest;
  });
}
