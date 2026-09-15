import { base } from '$app/paths';
import { createRepository } from '$lib/data/repository';
import type { LayoutLoad } from './$types';

export const prerender = true;
export const trailingSlash = 'always';
export const load: LayoutLoad = async ({ fetch }) => {
  const repository = createRepository(base, fetch);
  const manifest = await repository.getManifest();
  const initialSummary = await repository.getState(manifest.release, 'TX');
  return { manifest, initialSummary };
};
