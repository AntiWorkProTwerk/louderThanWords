import { manifestSchema, summarySchema, politicianSchema, identifier, stateCode } from './schema';
import type { z } from 'zod';

type Fetch = typeof globalThis.fetch;
async function read<T>(
  url: string,
  schema: z.ZodType<T>,
  fetcher: Fetch,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetcher(url, { signal });
  if (!response.ok)
    throw new Error(`Data could not be loaded (${response.status}). Please try again.`);
  return schema.parse(await response.json());
}
export function createRepository(base: string, fetcher: Fetch = globalThis.fetch) {
  const root = `${base}/data`;
  const releasePath = (release: string) => `${root}/releases/${identifier.parse(release)}`;
  return {
    getManifest: (signal?: AbortSignal) =>
      read(`${root}/manifest.json`, manifestSchema, fetcher, signal),
    async getState(release: string, code: string, signal?: AbortSignal) {
      const summary = await read(
        `${releasePath(release)}/states/${stateCode.parse(code)}/summary.json`,
        summarySchema,
        fetcher,
        signal,
      );
      if (summary.release !== release || summary.state.code !== code)
        throw new Error('Dataset version mismatch. Refresh to retry.');
      return summary;
    },
    async getPolitician(release: string, id: string, signal?: AbortSignal) {
      const person = await read(
        `${releasePath(release)}/politicians/${identifier.parse(id)}.json`,
        politicianSchema,
        fetcher,
        signal,
      );
      if (person.release !== release || person.id !== id)
        throw new Error('Dataset version mismatch. Refresh to retry.');
      return person;
    },
    geography: (release: string, layer: 'states' | 'world') =>
      `${releasePath(release)}/geography/${layer}.geojson`,
  };
}
export const money = (amount: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(amount);
