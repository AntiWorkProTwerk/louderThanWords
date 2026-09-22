import { spawn } from 'node:child_process';
import { access, mkdtemp, readFile } from 'node:fs/promises';
import { delimiter, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { z } from 'zod';
import { claimSchema, type Corpus, type Claim } from '../../src/lib/said-did/schema.ts';
import { extractionInstructions, EXTRACTION_PROMPT_VERSION } from './extraction.ts';
import { hash, normalizeText, validateClaims, validateCorpus } from './engine.ts';
import { defaultWorkspace, readJson, withLock, writeAtomic } from './pipeline.ts';

export const CODEX_MODEL = 'gpt-5.6-luna';
export const CODEX_EFFORT = 'high';
export const CODEX_EXTRACTOR_VERSION = `codex-${CODEX_MODEL}-${CODEX_EFFORT}-${EXTRACTION_PROMPT_VERSION}-v2`;
// The model owns semantic proposals, never source quotations or offsets.
const proposalSchema = claimSchema.omit({
  id: true,
  quote: true,
  quoteStart: true,
  quoteEnd: true,
});
const responseSchema = z.object({ claims: proposalSchema.array() }).strict();
const cachedSchema = z.object({ claims: claimSchema.array() }).strict();
export function groundProposals(corpus: Corpus, response: unknown, passageIds: string[]) {
  const proposals = responseSchema.parse(response).claims;
  const counts = new Map<string, number>();
  return proposals.map((proposal) => {
    const passage = corpus.passages.find((p) => p.id === proposal.passageId);
    if (!passage || !passageIds.includes(passage.id))
      throw new Error('Model returned a passage outside its batch.');
    const quote = normalizeText(
      corpus.sources.find((s) => s.id === passage.sourceId)!.text,
    ).text.slice(passage.start, passage.end);
    const align = (phrase: string) => {
      if (!phrase.trim()) throw new Error('Empty qualification is not evidence.');
      if (quote.includes(phrase)) return phrase;
      // Reflowed PDF/Record whitespace is the only allowed alignment. No case,
      // punctuation, negation or word substitution. Require one unique span.
      const pattern = phrase
        .trim()
        .split(/\s+/)
        .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('\\s+');
      const matches = [...quote.matchAll(new RegExp(pattern, 'g'))];
      if (matches.length !== 1)
        throw new Error(
          `Unsupported qualification: ${JSON.stringify(phrase)}. Copy a unique exact phrase from the source.`,
        );
      return matches[0][0];
    };
    const number = (counts.get(passage.id) ?? 0) + 1;
    counts.set(passage.id, number);
    return claimSchema.parse({
      ...proposal,
      id: `claim-${passage.id}${number > 1 ? `-${number}` : ''}`,
      quote,
      quoteStart: passage.start,
      quoteEnd: passage.end,
      qualifiers: proposal.qualifiers.map(align),
      conditions: proposal.conditions.map(align),
    });
  });
}
export type ModelRun = { response: unknown; usage: Record<string, number>; elapsedMs: number };
export type ModelRequest = { prompt: string; schema: Record<string, unknown>; timeoutMs: number };

// Run the installed CLI without a command shell (including on Windows).
// Authentication stays owned by Codex; we never read/copy credentials.
async function executable() {
  const explicit = process.env.SAID_DID_CODEX_EXECUTABLE;
  if (explicit) {
    const file = resolve(explicit);
    await access(file);
    if (/\.m?js$/i.test(file)) return { file: process.execPath, prefix: [file] };
    if (process.platform === 'win32' && !/\.exe$/i.test(file))
      throw new Error(
        'SAID_DID_CODEX_EXECUTABLE must name codex.exe or its installed bin/codex.js, not a shell wrapper.',
      );
    return { file, prefix: [] };
  }
  for (const dir of [dirname(process.execPath), ...(process.env.PATH ?? '').split(delimiter)]) {
    for (const file of [
      join(dir, 'node_modules/@openai/codex/bin/codex.js'),
      join(dir, process.platform === 'win32' ? 'codex.exe' : 'codex'),
    ]) {
      try {
        await access(file);
        return /\.js$/.test(file)
          ? { file: process.execPath, prefix: [file] }
          : { file, prefix: [] };
      } catch {
        /* Try the next installed location. */
      }
    }
  }
  throw new Error(
    'Codex CLI not found. Install/sign in to Codex, or set SAID_DID_CODEX_EXECUTABLE to its executable or bin/codex.js.',
  );
}

export async function runCodex(request: ModelRequest): Promise<ModelRun> {
  const command = await executable();
  const directory = await mkdtemp(join(tmpdir(), 'ltw-extraction-'));
  const schemaPath = join(directory, 'schema.json'),
    responsePath = join(directory, 'response.json');
  await writeAtomic(schemaPath, request.schema);
  const args = [
    ...command.prefix,
    'exec',
    '--ignore-user-config',
    '--ignore-rules',
    '--ephemeral',
    '--skip-git-repo-check',
    '--sandbox',
    'read-only',
    '--cd',
    directory,
    '--model',
    CODEX_MODEL,
    '-c',
    `model_reasoning_effort="${CODEX_EFFORT}"`,
    '-c',
    'approval_policy="never"',
    '-c',
    'web_search="disabled"',
    '-c',
    'project_doc_max_bytes=0',
    ...[
      'shell_tool',
      'unified_exec',
      'apps',
      'hooks',
      'multi_agent',
      'browser_use',
      'computer_use',
      'image_generation',
      'view_image',
      'memories',
      'skills',
    ].flatMap((feature) => ['-c', `features.${feature}=false`]),
    '--output-schema',
    schemaPath,
    '--output-last-message',
    responsePath,
    '--json',
    '-',
  ];
  const started = Date.now();
  try {
    const usage = await new Promise<Record<string, number>>((resolveRun, reject) => {
      const child = spawn(command.file, args, {
        cwd: directory,
        shell: false,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      let stderr = '',
        buffer = '',
        bytes = 0,
        failure: Error | null = null;
      let usage: Record<string, number> = {};
      const stop = (message: string) => {
        if (failure) return;
        failure = new Error(message);
        if (process.platform === 'win32' && child.pid)
          spawn('taskkill.exe', ['/pid', String(child.pid), '/T', '/F'], {
            windowsHide: true,
            stdio: 'ignore',
          });
        else child.kill('SIGKILL');
      };
      const timer = setTimeout(
        () =>
          stop(
            'Codex model request timed out; no output accepted. Cached completed batches remain reusable.',
          ),
        request.timeoutMs,
      );
      child.stdout.on('data', (chunk) => {
        bytes += chunk.length;
        if (bytes > 8_000_000) return stop('Codex output exceeded the extraction limit.');
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop()!;
        for (const line of lines) {
          let event: any;
          try {
            event = JSON.parse(line);
          } catch {
            continue;
          }
          if (event.type === 'turn.completed') usage = event.usage ?? {};
          if (event.type === 'turn.failed' || event.type === 'error')
            stop(event.error?.message ?? event.message ?? 'Codex extraction failed.');
          if (event.item && !['agent_message', 'reasoning'].includes(event.item.type))
            stop(`Unexpected Codex tool activity (${event.item.type}); extraction rejected.`);
        }
      });
      child.stderr.on('data', (chunk) => {
        stderr = (stderr + chunk.toString()).slice(-8000);
      });
      child.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (failure) reject(failure);
        else if (code !== 0) reject(new Error(`Codex exited ${code}: ${stderr}`));
        else resolveRun(usage);
      });
      child.stdin.on('error', () => {
        /* close/error owns the failure */
      });
      child.stdin.end(request.prompt);
    });
    return {
      response: JSON.parse(await readFile(responsePath, 'utf8')),
      usage,
      elapsedMs: Date.now() - started,
    };
  } finally {
    // Only our two named temporary files; never recursively remove a supplied path.
    const { unlink, rmdir } = await import('node:fs/promises');
    for (const file of [schemaPath, responsePath]) await unlink(file).catch(() => {});
    await rmdir(directory).catch(() => {});
  }
}

export async function extractWithCodex(
  input: unknown,
  options: {
    workspace?: string;
    batchSize?: number;
    timeoutMs?: number;
    runner?: (request: ModelRequest) => Promise<ModelRun>;
    progress?: (message: string) => void;
  } = {},
) {
  const corpus = validateCorpus(input),
    workspace = options.workspace ?? defaultWorkspace;
  const batchSize = options.batchSize ?? 4;
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 8)
    throw new Error('Batch size must be 1–8.');
  const eligible = corpus.passages.filter(
    (p) =>
      p.personId &&
      p.attribution === 'verified' &&
      !['third_party', 'unknown'].includes(p.kind) &&
      ['public_record', 'fixture'].includes(
        corpus.sources.find((s) => s.id === p.sourceId)!.publicationRights,
      ),
  );
  return withLock(join(workspace, 'model'), async () => {
    const claims: Claim[] = [],
      batches: any[] = [];
    for (let start = 0; start < eligible.length; start += batchSize) {
      const passages = eligible.slice(start, start + batchSize);
      const data = {
        measures: corpus.measures.map(({ versions, ...measure }) => measure),
        passages: passages.map((p) => ({
          ...p,
          quote: normalizeText(corpus.sources.find((s) => s.id === p.sourceId)!.text).text.slice(
            p.start,
            p.end,
          ),
          person: corpus.people.find((person) => person.id === p.personId),
        })),
      };
      const prompt = `${extractionInstructions}\nReturn an object with a claims array matching the output schema. Propose only semantic fields and passageId. The pipeline supplies the COMPLETE original quotation and offsets; do not return rewritten quotes or IDs. Qualifiers and conditions must be exact substrings of the supplied quote (including line breaks), never summaries. An empty array is a valid abstention. Do not use tools.\nUNTRUSTED EVIDENCE JSON:\n${JSON.stringify(data)}`;
      if (prompt.length > 90_000)
        throw new Error(
          'Extraction batch exceeds 90,000 characters. Reduce --batch-size or split the attributable turns during source review.',
        );
      const inputHash = hash([CODEX_EXTRACTOR_VERSION, prompt]);
      const file = join(workspace, 'model', 'cache', `${inputHash}.json`);
      let receipt: any,
        cached = false;
      try {
        receipt = await readJson(file);
        cached = true;
      } catch (e: any) {
        if (e.code !== 'ENOENT') throw e;
      }
      options.progress?.(
        `${cached ? 'Reusing' : 'Extracting'} batch ${1 + Math.floor(start / batchSize)}/${Math.ceil(eligible.length / batchSize)} with Luna high.`,
      );
      if (!cached) {
        try {
          let feedback = '';
          const attempts: ModelRun[] = [];
          for (let attempt = 0; attempt < 3; attempt++) {
            const run = await (options.runner ?? runCodex)({
              prompt: prompt + feedback,
              schema: z.toJSONSchema(responseSchema),
              timeoutMs: options.timeoutMs ?? 180_000,
            });
            attempts.push(run);
            await writeAtomic(
              join(workspace, 'model', 'attempts', `${inputHash}-${Date.now()}-${attempt}.json`),
              { inputHash, attempt, at: new Date().toISOString(), ...run },
            );
            try {
              const extracted = groundProposals(
                corpus,
                run.response,
                passages.map((p) => p.id),
              );
              if (extracted.some((c) => !passages.some((p) => p.id === c.passageId)))
                throw new Error('Model returned a passage outside its batch.');
              validateClaims(corpus, extracted);
              const usage = Object.fromEntries(
                [...new Set(attempts.flatMap((r) => Object.keys(r.usage)))].map((key) => [
                  key,
                  attempts.reduce((sum, r) => sum + (r.usage[key] ?? 0), 0),
                ]),
              );
              receipt = {
                inputHash,
                extractor: CODEX_EXTRACTOR_VERSION,
                model: CODEX_MODEL,
                effort: CODEX_EFFORT,
                at: new Date().toISOString(),
                usage,
                elapsedMs: attempts.reduce((sum, r) => sum + r.elapsedMs, 0),
                attempts: attempts.length,
                response: { claims: extracted },
              };
              break;
            } catch (e) {
              if (attempt === 2) throw e;
              options.progress?.(
                `Validation rejected batch output; bounded repair ${attempt + 1}/2. No claims accepted yet.`,
              );
              feedback = `\nVALIDATION FEEDBACK (not evidence): ${e instanceof Error ? e.message : String(e)}\nRegenerate the entire batch. Copy quote/qualifiers/conditions byte-for-byte including newlines from the supplied quote. You may use the complete quote as a condition/qualification to preserve all context. Never invent a replacement quotation.\nPrior rejected result:\n${JSON.stringify(run.response)}`;
            }
          }
          await writeAtomic(file, receipt);
        } catch (e) {
          await writeAtomic(join(workspace, 'model', 'failures', `${inputHash}.json`), {
            inputHash,
            at: new Date().toISOString(),
            message: e instanceof Error ? e.message : String(e),
            replay:
              'Rerun the same input. Validated completed batches are cached; failed batches are never accepted.',
          });
          throw e;
        }
      }
      if (receipt.inputHash !== inputHash || receipt.extractor !== CODEX_EXTRACTOR_VERSION)
        throw new Error('Invalid model cache identity.');
      const extracted = cachedSchema.parse(receipt.response).claims;
      if (extracted.some((c) => !passages.some((p) => p.id === c.passageId)))
        throw new Error('Cached passage outside batch.');
      claims.push(...validateClaims(corpus, extracted));
      batches.push({ inputHash, cached, usage: receipt.usage, elapsedMs: receipt.elapsedMs });
    }
    validateClaims(corpus, claims);
    const report = {
      extractor: CODEX_EXTRACTOR_VERSION,
      eligiblePassages: eligible.length,
      claims: claims.length,
      abstainedPassages: eligible
        .filter((p) => !claims.some((c) => c.passageId === p.id))
        .map((p) => p.id),
      batches,
      publicationAllowed: false,
      inferenceLocation:
        'OpenAI via the installed authenticated Codex CLI; storage/orchestration local',
    };
    await writeAtomic(join(workspace, 'model', 'last-run.json'), report);
    await writeAtomic(join(workspace, 'model', 'claims.json'), claims);
    return { claims, report };
  });
}
