import { manifestSchema, indexSchema, comparisonSchema } from './schema';
export function evidenceRepository(base: string, fetcher: typeof fetch = fetch) {
  const root = `${base}/data/said-did`;
  async function read(path: string, signal?: AbortSignal) {
    const r = await fetcher(`${root}/${path}`, { signal });
    if (!r.ok)
      throw new Error(
        `Evidence is unavailable (${r.status}). The last published files have not been replaced.`,
      );
    return r.json();
  }
  const safe = (s: string) => {
    if (!/^[a-z0-9-]+$/.test(s)) throw new Error('Invalid evidence identifier');
    return s;
  };
  return {
    manifest: async (signal?: AbortSignal) =>
      manifestSchema.parse(await read('manifest.json', signal)),
    index: async (release: string, signal?: AbortSignal) => {
      const data = indexSchema.parse(await read(`releases/${safe(release)}/index.json`, signal));
      if (data.release !== release) throw new Error('Evidence release mismatch');
      return data;
    },
    comparison: async (release: string, id: string, signal?: AbortSignal) => {
      const data = comparisonSchema.parse(
        await read(`releases/${safe(release)}/comparisons/${safe(id)}.json`, signal),
      );
      if (data.id !== id) throw new Error('Comparison identity mismatch');
      return data;
    },
  };
}
