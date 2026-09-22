import { base } from '$app/paths';
import { loadRevolving } from '$lib/civic/revolving-repository';
import { loadLobbying } from '$lib/civic/lobbying-repository';
export async function load({ fetch }: { fetch: typeof globalThis.fetch }) {
  try {
    const [revolving, lobbying] = await Promise.all([
      loadRevolving(fetch, base),
      loadLobbying(fetch, base).catch(() => null),
    ]);
    // Only offer an exact cross-product evidence link when both UUID and raw record hash agree.
    const agendaRecords = new Map(
      lobbying?.data.records.map((r) => [r.id, r.source.recordHash]) ?? [],
    );
    const agendaLinks = revolving.data.filings
      .filter((f) => agendaRecords.get(f.id) === f.source.recordHash)
      .map((f) => f.id);
    return { revolving, agendaLinks, revolvingError: null };
  } catch {
    return {
      revolving: null,
      agendaLinks: [] as string[],
      revolvingError: 'The career-record snapshot could not load. Reload to try again.',
    };
  }
}
