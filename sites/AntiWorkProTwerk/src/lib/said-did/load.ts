import { base } from '$app/paths';
import { error } from '@sveltejs/kit';
import { evidenceRepository } from './repository';
export async function loadEvidence(fetcher: typeof fetch, view = '') {
  const repository = evidenceRepository(base, fetcher);
  const manifest = await repository.manifest(),
    index = await repository.index(manifest.release);
  const segments = view.split('/').filter(Boolean);
  const [kind = 'explore', id, history, release] = segments;
  if (segments.length > 4 || (['explore','methodology'].includes(kind) && segments.length > 1) || (['members','measures'].includes(kind) && segments.length !== 2)) error(404,'Evidence page not found');
  if (!['explore', 'comparisons', 'members', 'measures', 'methodology'].includes(kind))
    error(404, 'Evidence page not found');
  const item = index.items.find((c) => c.id === id);
  const comparison =
    kind === 'comparisons' && item ? await repository.comparison(manifest.release, id) : null;
  const person =
    kind === 'members'
      ? (index.people.find((p) => p.id === id) ?? null)
      : (comparison?.person ?? null);
  const measure =
    kind === 'measures'
      ? (index.measures.find((m) => m.id === id) ?? null)
      : (comparison?.measure ?? null);
  if (
    (kind === 'comparisons' && !comparison) ||
    (kind === 'members' && !person) ||
    (kind === 'measures' && !measure)
  )
    error(404, 'No published evidence at this address');
  let archived = null;
  if (history || release) {
    if (
      kind !== 'comparisons' ||
      history !== 'history' ||
      !comparison?.history.some((h) => h.release === release)
    )
      error(404, 'Archived revision not found');
    archived = await repository.comparison(release, id);
  }
  return {
    evidence: {
      manifest,
      index,
      kind,
      comparison: archived ?? comparison,
      currentStatus: comparison?.status ?? null,
      archived: !!archived,
      recordRelease: archived ? release : manifest.release,
      person,
      measure,
    },
    evidenceState: comparison?.state ?? person?.terms.at(-1)?.state ?? null,
  };
}
