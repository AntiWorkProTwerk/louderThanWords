import { env } from '$env/dynamic/private';
import { handleApi, type AppEnv } from '$lib/server/api';
import type { RequestHandler } from './$types';
export const prerender = false;
const handle: RequestHandler = ({ request, params, platform }) =>
  handleApi(
    request,
    { ...env, ...(platform as { env?: AppEnv } | undefined)?.env },
    params.path ?? '',
  );
export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const DELETE = handle;
