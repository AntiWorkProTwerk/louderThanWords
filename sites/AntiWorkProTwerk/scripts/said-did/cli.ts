import { parseArgs } from 'node:util';
import { z } from 'zod';
import { corpusSchema, claimSchema, reviewSchema } from '../../src/lib/said-did/schema.ts';
import { resolve, join, dirname } from 'node:path';
import { readFile } from 'node:fs/promises';
import { seed, demoCorpus } from './fixtures.ts';
import {
  prepare,
  publish,
  readJson,
  readStore,
  addReview,
  rollback,
  status,
  writeAtomic,
  defaultWorkspace,
  defaultOutput,
} from './pipeline.ts';
import { hash, extractDeterministic, generateCandidates } from './engine.ts';
import { extractionRequest } from './extraction.ts';
import { validateCorpus } from './engine.ts';
import { extractWithCodex, CODEX_EXTRACTOR_VERSION } from './codex-extractor.ts';
import { collectSources, acquisitionSchema } from './sources.ts';
import { createEvaluationSet, evaluationSchema, saveEvaluation } from './evaluation.ts';
import { discoverSources, discoverySchema } from './discovery.ts';
import { reviewWithCodex } from './ai-review.ts';
import { writeAnnotationPacket, refreshAnnotationPacket } from './annotation-packet.ts';

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    input: { type: 'string' },
    workspace: { type: 'string' },
    out: { type: 'string' },
    extractions: { type: 'string' },
    'extractor-version': { type: 'string' },
    review: { type: 'string' },
    release: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
    ai: { type: 'boolean', default: false },
    offline: { type: 'boolean', default: false },
    'batch-size': { type: 'string' },
    dataset: { type: 'string' },
  },
});
const command = positionals[0] ?? 'help',
  workspace = values.workspace ? resolve(values.workspace) : defaultWorkspace,
  output = values.out ? resolve(values.out) : defaultOutput;
try {
  if (values.offline && (command === 'extract' || command === 'review-ai' || values.ai))
    throw new Error('--offline forbids Codex inference; use cached/imported claims without --ai.');
  if (values.ai && values.extractions) throw new Error('Choose --ai or --extractions, not both.');
  let result: unknown;
  switch (command) {
    case 'seed':
      result = await seed(workspace, output);
      break;
    case 'example':
      console.log(JSON.stringify(demoCorpus(), null, 2));
      break;
    case 'contracts': {
      const directory = join(workspace, 'contracts');
      await writeAtomic(join(directory, 'corpus.schema.json'), z.toJSONSchema(corpusSchema));
      await writeAtomic(join(directory, 'claims.schema.json'), z.toJSONSchema(claimSchema.array()));
      await writeAtomic(join(directory, 'review.schema.json'), z.toJSONSchema(reviewSchema));
      await writeAtomic(join(directory, 'example-corpus.json'), demoCorpus());
      await writeAtomic(
        join(directory, 'acquisition.schema.json'),
        z.toJSONSchema(acquisitionSchema),
      );
      await writeAtomic(
        join(directory, 'evaluation.schema.json'),
        z.toJSONSchema(evaluationSchema),
      );
      await writeAtomic(join(directory, 'discovery.schema.json'), z.toJSONSchema(discoverySchema));
      result = {
        directory,
        message:
          'Portable JSON schemas and a complete fictional input. Keep your real inputs outside public/.',
      };
      break;
    }
    case 'discover': {
      if (!values.input) throw new Error('Provide --input discovery.json');
      const discovered = await discoverSources(await readJson(resolve(values.input)), {
        workspace,
        offline: values.offline,
      });
      result = { file: discovered.file, diagnostics: discovered.diagnostics };
      break;
    }
    case 'collect': {
      if (!values.input) throw new Error('Provide --input acquisition.json');
      const collected = await collectSources(await readJson(resolve(values.input)), {
        workspace,
        inputDirectory: dirname(resolve(values.input)),
        offline: values.offline,
      });
      result = {
        file: collected.file,
        counts: collected.report.counts,
        notices: collected.report.issues.length,
        report: join(workspace, 'acquisition', 'report.json'),
      };
      break;
    }
    case 'review-ai': {
      if (values.input && !values.extractions)
        throw new Error(
          'Provide --extractions claims.json with --input, or omit both to audit the workspace store.',
        );
      const store = values.input ? null : await readStore(workspace);
      result = await reviewWithCodex(
        values.input ? await readJson(resolve(values.input)) : store!.corpus,
        values.extractions ? await readJson(resolve(values.extractions)) : store!.claims,
        {
          workspace,
          batchSize: values['batch-size'] ? Number(values['batch-size']) : undefined,
          progress: (message) => console.error(message),
        },
      );
      break;
    }
    case 'extract': {
      const corpus = values.input
        ? await readJson(resolve(values.input))
        : (await readStore(workspace)).corpus;
      result = (
        await extractWithCodex(corpus, {
          workspace,
          batchSize: values['batch-size'] ? Number(values['batch-size']) : undefined,
          progress: (message) => console.error(message),
        })
      ).report;
      break;
    }
    case 'annotation-refresh': {
      if (!values.out) throw new Error('Provide --out existing-packet-directory');
      result = await refreshAnnotationPacket(output);
      break;
    }
    case 'annotation-packet': {
      if (!values.input || !values.dataset || !values.out)
        throw new Error(
          'Provide --input corpus.json --dataset annotations.json --out NEW-existing-parent/packet-directory',
        );
      result = await writeAnnotationPacket(
        await readJson(resolve(values.input)),
        await readJson(resolve(values.dataset)),
        output,
      );
      break;
    }
    case 'annotate': {
      if (!values.input) throw new Error('Provide --input corpus.json');
      const corpus = await readJson(resolve(values.input));
      const dataset = createEvaluationSet(corpus);
      const file = join(workspace, 'evaluation', `${dataset.id}.json`);
      // Re-running template creation must not overwrite a human's labels.
      try {
        await readFile(file);
        throw new Error(`Annotation template already exists: ${file}`);
      } catch (e: any) {
        if (e.code !== 'ENOENT') throw e;
      }
      await writeAtomic(file, dataset);
      result = {
        file,
        cases: dataset.cases.length,
        message:
          'Fill labels against original sources; human_reviewed requires an actual human review. Keep the fixed bill/day split.',
      };
      break;
    }
    case 'run':
    case 'replay': {
      const prior = command === 'replay' ? await readStore(workspace) : null;
      const input = values.input
        ? await readJson(resolve(values.input))
        : command === 'replay'
          ? prior!.corpus
          : null;
      if (!input) throw new Error('Provide --input corpus.json');
      if (values.ai && (values.extractions || values['dry-run'] || values.offline))
        throw new Error(
          '--ai cannot combine with --extractions, --dry-run or --offline. Codex performs remote inference.',
        );
      const modelRun = values.ai
        ? await extractWithCodex(input, {
            workspace,
            batchSize: values['batch-size'] ? Number(values['batch-size']) : undefined,
            progress: (message) => console.error(message),
          })
        : null;
      const extraction =
        modelRun?.claims ??
        (values.extractions ? await readJson(resolve(values.extractions)) : prior?.claims);
      try {
        result = await prepare(input, {
          workspace,
          extraction,
          extractorVersion: modelRun
            ? CODEX_EXTRACTOR_VERSION
            : (values['extractor-version'] ?? prior?.runs.at(-1)?.extractor),
          dryRun: values['dry-run'],
        });
        if (!values['dry-run']) await publish(workspace, output);
      } catch (e) {
        if (!values['dry-run'])
          await writeAtomic(join(workspace, 'failures', `${hash(input)}.json`), {
            inputHash: hash(input),
            at: new Date().toISOString(),
            message: e instanceof Error ? e.message : String(e),
            replay: 'Fix the input and rerun with the same --input path.',
          });
        throw e;
      }
      break;
    }
    case 'review':
      if (!values.review) throw new Error('Provide --review decision.json');
      result = await addReview(await readJson(resolve(values.review)), workspace);
      break;
    case 'publish':
      result = await publish(workspace, output);
      break;
    case 'status':
      result = await status(workspace);
      break;
    case 'extract-request': {
      const corpus = values.input
        ? validateCorpus(await readJson(resolve(values.input)))
        : (await readStore(workspace)).corpus;
      const request = extractionRequest(corpus);
      const file = join(workspace, 'extraction-requests', `${request.inputHash}.json`);
      await writeAtomic(file, request);
      result = {
        file,
        inputHash: request.inputHash,
        instructions:
          'Supply this request to your chosen local/offline model. Import its claims array with run --input corpus.json --extractions claims.json --extractor-version model-prompt-v1. No model is invoked by this command.',
      };
      break;
    }
    case 'rollback':
      if (!values.release) throw new Error('Provide --release sd-...');
      result = await rollback(values.release, workspace, output);
      break;
    case 'evaluate': {
      if (values.dataset) {
        if (!values.input)
          throw new Error('Provide --input corpus.json with --dataset annotations.json');
        const corpus = validateCorpus(await readJson(resolve(values.input)));
        const claims = values.ai
          ? (
              await extractWithCodex(corpus, {
                workspace,
                progress: (message) => console.error(message),
              })
            ).claims
          : values.extractions
            ? await readJson(resolve(values.extractions))
            : extractDeterministic(corpus);
        result = await saveEvaluation(
          corpus,
          claims,
          await readJson(resolve(values.dataset)),
          workspace,
        );
        if ((result as any).acceptance !== 'passed') process.exitCode = 2;
        break;
      }
      const corpus = demoCorpus(),
        claims = extractDeterministic(corpus),
        candidates = generateCandidates(corpus, claims);
      const expectations = [
        'consistent',
        'apparent_tension',
        'context_dependent',
        'context_dependent',
        'consistent',
        'context_dependent',
        'context_dependent',
        'blocked',
        'unmatched',
      ];
      const outcomes = corpus.passages.map((p, i) => {
        const c = candidates.find((c) => c.passage.id === p.id)!;
        const actual = !c.action
          ? 'unmatched'
          : c.blockers.length
            ? 'blocked'
            : c.suggestedAssessment;
        return {
          passage: p.id,
          expected: expectations[i],
          actual,
          pass: actual === expectations[i],
        };
      });
      result = {
        dataset: 'Nine authored synthetic fixtures; not held-out real-world accuracy.',
        passed: outcomes.filter((o) => o.pass).length,
        total: outcomes.length,
        outcomes,
      };
      if (outcomes.some((o) => !o.pass)) process.exitCode = 1;
      break;
    }
    default:
      console.log(
        'AI review: review-ai [--input corpus.json --extractions claims.json] [--workspace path] [--batch-size 6]. Private diagnostics only; no publication or human labels.\nWorksheets: annotation-packet --input corpus.json --dataset annotations.json --out NEW-directory | annotation-refresh --out existing-packet-directory',
      );
      console.log(
        'Local Said / Did pipeline\nCommands: seed | example | contracts | collect --input acquisition.json [--offline] | extract --input corpus.json | extract-request [--input corpus.json] | run --input corpus.json [--ai | --extractions claims.json --extractor-version model-prompt-v1] [--dry-run] | annotate --input corpus.json | evaluate --input corpus.json --dataset annotations.json [--ai | --extractions claims.json] | replay | review --review decision.json | publish | evaluate | status | rollback --release sd-...\nOptional: --workspace path --out path --batch-size 4. Codex AI uses Luna high through your existing sign-in. No database or hosted task service required.',
      );
  }
  if (result) console.log(JSON.stringify(result, null, 2));
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
}
