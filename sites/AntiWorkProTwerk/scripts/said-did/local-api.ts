import { randomUUID } from 'node:crypto';
import type { Plugin } from 'vite';
import {
  readStore,
  prepare,
  addReview,
  publish,
  defaultWorkspace,
  defaultOutput,
} from './pipeline.ts';
import { seed } from './fixtures.ts';
import { extractWithCodex, CODEX_EXTRACTOR_VERSION } from './codex-extractor.ts';
import { collectSources, acquisitionSchema } from './sources.ts';
import { createEvaluationSet, validateEvaluation, saveEvaluation } from './evaluation.ts';
import { join } from 'node:path';
import { currentAiReview, reviewWithCodex } from './ai-review.ts';
import { readJson, writeAtomic, withLock } from './pipeline.ts';

export async function handleLocalEvidence(
  request: Request,
  token: string,
  workspace = defaultWorkspace,
  output = defaultOutput,
) {
  const headers = {
    'Cache-Control': 'private, no-store',
    Vary: 'Origin',
    'Content-Type': 'application/json',
  };
  const respond = (body: unknown, status = 200) => Response.json(body, { status, headers });
  const url = new URL(request.url);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))
    return respond({ error: 'Local loopback requests only' }, 403);
  const origin = request.headers.get('origin');
  if (origin && origin !== url.origin)
    return respond({ error: 'Cross-origin review access denied' }, 403);
  if (request.headers.get('sec-fetch-site') === 'cross-site')
    return respond({ error: 'Cross-site review access denied' }, 403);
  try {
    if (request.method === 'GET') {
      let store = null;
      try {
        store = await readStore(workspace);
      } catch (e: any) {
        if (e.code !== 'ENOENT') throw e;
      }
      const optional = async (file: string) => {
        try {
          return await readJson(file);
        } catch (e: any) {
          if (e.code === 'ENOENT') return null;
          throw e;
        }
      };
      let pilotStore = null;
      try {
        pilotStore = await readStore(join(workspace, 'real-pilot'));
      } catch (e: any) {
        if (e.code !== 'ENOENT') throw e;
      }
      return respond({
        token,
        store,
        model: await optional(join(workspace, 'model', 'last-run.json')),
        evaluation: await optional(join(workspace, 'evaluation', 'annotations.json')),
        evaluationReport: await optional(join(workspace, 'evaluation', 'report.json')),
        acquisition: await optional(join(workspace, 'acquisition', 'report.json')),
        aiReview: store ? await currentAiReview(store.corpus, store.claims, workspace) : null,
        pilotAvailable: !!pilotStore,
        pilotAiReview: pilotStore
          ? await currentAiReview(
              pilotStore.corpus,
              pilotStore.claims,
              join(workspace, 'real-pilot'),
            )
          : null,
      });
    }
    if (request.method !== 'POST') return respond({ error: 'Method not allowed' }, 405);
    if (origin !== url.origin || request.headers.get('x-ltw-local-review') !== token)
      return respond({ error: 'A same-origin local review token is required' }, 403);
    if (!request.headers.get('content-type')?.startsWith('application/json'))
      return respond({ error: 'JSON required' }, 415);
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > 5_000_000)
      return respond({ error: 'Input exceeds 5 MB' }, 413);
    const body = JSON.parse(raw);
    if (body.operation === 'review-ai') {
      if (body.allowRemoteInference !== true)
        throw new Error('Explicit consent to send review evidence through Codex is required.');
      if (body.target !== undefined && !['working', 'real-pilot'].includes(body.target))
        throw new Error('Choose the working corpus or the fixed real-pilot workspace.');
      const reviewWorkspace =
        body.target === 'real-pilot' ? join(workspace, 'real-pilot') : workspace;
      const store = await readStore(reviewWorkspace);
      await reviewWithCodex(store.corpus, store.claims, { workspace: reviewWorkspace });
      // A concurrent ingest cannot make an old audit appear current. It remains
      // archived against its original hashes; currentAiReview explicitly marks stale.
      const current = await readStore(reviewWorkspace);
      return respond({
        aiReview: await currentAiReview(current.corpus, current.claims, reviewWorkspace),
      });
    }
    if (body.operation === 'extract') {
      if (body.allowRemoteInference !== true)
        throw new Error('Explicit consent to send passages through Codex is required.');
      const store = await readStore(workspace);
      const result = await extractWithCodex(store.corpus, { workspace });
      // prepare is atomic; old approvals cannot survive changed model claims.
      await prepare(store.corpus, {
        workspace,
        extraction: result.claims,
        extractorVersion: CODEX_EXTRACTOR_VERSION,
        expectedInputHash: store.inputHash,
      });
      await publish(workspace, output);
      return respond({ model: result.report });
    }
    if (body.operation === 'collect') {
      const plan = acquisitionSchema.parse(body.plan);
      if (plan.documents.some((d) => d.localFile))
        throw new Error(
          'Use the CLI to read local document paths. The browser collector accepts official URLs only.',
        );
      const collected = await collectSources(plan, { workspace });
      await prepare(collected.corpus, { workspace });
      await publish(workspace, output);
      return respond({ acquisition: collected.report });
    }
    if (body.operation === 'annotation-template') {
      const store = await readStore(workspace),
        dataset = createEvaluationSet(store.corpus);
      await withLock(workspace, async () => {
        const file = join(workspace, 'evaluation', 'annotations.json');
        try {
          await readJson(file);
          throw new Error(
            'An annotation set already exists. Export it before starting a new corpus.',
          );
        } catch (e: any) {
          if (e.code !== 'ENOENT') throw e;
        }
        await writeAtomic(file, dataset);
      });
      return respond({ evaluation: dataset });
    }
    if (body.operation === 'annotation-save') {
      const store = await readStore(workspace),
        dataset = validateEvaluation(body.dataset, store.corpus);
      await withLock(workspace, async () => {
        // Append-only receipts keep previous human annotations recoverable.
        await writeAtomic(
          join(workspace, 'evaluation', 'revisions', `${randomUUID()}.json`),
          dataset,
        );
        await writeAtomic(join(workspace, 'evaluation', 'annotations.json'), dataset);
      });
      return respond({ evaluation: dataset });
    }
    if (body.operation === 'evaluate') {
      const store = await readStore(workspace);
      return respond(
        await saveEvaluation(
          store.corpus,
          store.claims,
          await readJson(join(workspace, 'evaluation', 'annotations.json')),
          workspace,
        ),
      );
    }
    if (body.operation === 'seed') return respond(await seed(workspace, output));
    if (body.operation === 'ingest') {
      await prepare(body.corpus, {
        workspace,
        extraction: body.extraction,
        extractorVersion: body.extractorVersion,
      });
      return respond(await publish(workspace, output));
    }
    if (body.operation === 'review') return respond(await addReview(body.review, workspace));
    if (body.operation === 'publish') return respond(await publish(workspace, output));
    return respond({ error: 'Unknown local operation' }, 400);
  } catch (e) {
    return respond({ error: e instanceof Error ? e.message : String(e) }, 400);
  }
}
export function localEvidencePlugin(): Plugin {
  return {
    name: 'local-evidence-workbench',
    apply: 'serve',
    configureServer(server) {
      const token = randomUUID();
      server.middlewares.use(async (req, res, next) => {
        if (req.url?.split('?')[0] !== '/api/local-evidence') return next();
        try {
          const chunks: Buffer[] = [];
          let length = 0;
          for await (const chunk of req) {
            length += chunk.length;
            if (length > 5_000_000) {
              res.writeHead(413);
              res.end('Input exceeds 5 MB');
              return;
            }
            chunks.push(Buffer.from(chunk));
          }
          const request = new Request(`http://${req.headers.host}${req.url}`, {
            method: req.method,
            headers: new Headers(
              Object.entries(req.headers).flatMap(([key, value]): [string, string][] =>
                typeof value === 'string' ? [[key, value]] : [],
              ),
            ),
            body: req.method === 'POST' ? Buffer.concat(chunks).toString('utf8') : undefined,
          });
          const response = await handleLocalEvidence(request, token);
          res.writeHead(response.status, Object.fromEntries(response.headers));
          res.end(await response.text());
        } catch {
          res.writeHead(400, { 'Cache-Control': 'no-store' });
          res.end('Invalid local request');
        }
      });
    },
  };
}
