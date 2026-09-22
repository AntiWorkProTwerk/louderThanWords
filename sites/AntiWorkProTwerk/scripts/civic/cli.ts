import { parseArgs } from 'node:util';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { collectSources } from '../said-did/sources';
import { publishVoteReceipts } from './votes';
import { runTrials } from './trials';
import { runRules } from './rules';
import { runEconomy } from './economy';
import { runResearch } from './research';
import { runPaycheck } from './paycheck';
import { runComplaints } from './complaints';
import { runWages } from './wages';
import { runLobbying } from './lobbying';
import { runRevolving } from './revolving';
import { runGraveyard } from './graveyard';
import { runNursing } from './nursing';
import { runEcho } from './echo';
import { runWater } from './water';
import { runInsiders } from './insiders';
import { runHoldings } from './holdings';
import { runSharedInvestors } from './shared-investors';
import { runStakes } from './major-stakes';
import { runFundVotes } from './fund-votes';
import { analyzePaycheck, paycheckDataSchema, paycheckRegions } from '../../src/lib/civic/paycheck';
import {
  analyzeChart,
  alternativeWindows,
  economyDataSchema,
  chartConfigSchema,
} from '../../src/lib/civic/economy';
import { hash } from '../said-did/engine';
import { siteRoot, writeAtomic } from '../said-did/pipeline';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    input: { type: 'string' },
    plan: { type: 'string' },
    output: { type: 'string' },
    workspace: { type: 'string' },
    offline: { type: 'boolean' },
    holdings: { type: 'string' },
  },
});
if (
  positionals.length !== 1 ||
  ![
    'votes',
    'trials',
    'rules',
    'economy',
    'chart',
    'research',
    'paycheck',
    'paycheck-calc',
    'complaints',
    'wages',
    'lobbying',
    'revolving',
    'graveyard',
    'nursing',
    'echo',
    'water',
    'insiders',
    'holdings',
    'shared-investors',
    'major-stakes',
    'fund-votes',
  ].includes(positionals[0]) ||
  (['chart', 'paycheck-calc'].includes(positionals[0])
    ? !values.input || !values.plan
    : Boolean(values.input) === Boolean(values.plan))
) {
  throw new Error(
    'Usage: civic (votes|trials|rules|economy|research|paycheck|complaints|wages|lobbying|revolving|graveyard|nursing|echo|water|insiders|holdings|shared-investors|major-stakes|fund-votes) (--input input.json | --plan acquisition.json) [--offline] [--holdings holdings-directory] [--workspace directory] [--output directory]; or civic (chart|paycheck-calc) --input snapshot.json --plan calculation.json [--output result.json]',
  );
}
if (positionals[0] === 'fund-votes') {
  console.log(
    JSON.stringify(
      await runFundVotes({
        input: values.input ? JSON.parse(await readFile(resolve(values.input), 'utf8')) : undefined,
        plan: values.plan ? JSON.parse(await readFile(resolve(values.plan), 'utf8')) : undefined,
        workspace: resolve(values.workspace ?? '.local/fund-votes'),
        output: resolve(values.output ?? 'public/data/fund-votes'),
        offline: values.offline,
      }),
      null,
      2,
    ),
  );
} else if (positionals[0] === 'major-stakes') {
  console.log(
    JSON.stringify(
      await runStakes({
        input: values.input ? JSON.parse(await readFile(resolve(values.input), 'utf8')) : undefined,
        plan: values.plan ? JSON.parse(await readFile(resolve(values.plan), 'utf8')) : undefined,
        workspace: resolve(values.workspace ?? '.local/major-stakes'),
        output: resolve(values.output ?? 'public/data/major-stakes'),
        offline: values.offline,
      }),
      null,
      2,
    ),
  );
} else if (positionals[0] === 'shared-investors') {
  console.log(
    JSON.stringify(
      await runSharedInvestors({
        input: values.input ? JSON.parse(await readFile(resolve(values.input), 'utf8')) : undefined,
        plan: values.plan ? JSON.parse(await readFile(resolve(values.plan), 'utf8')) : undefined,
        holdings: resolve(values.holdings ?? 'public/data/holdings'),
        workspace: resolve(values.workspace ?? '.local/shared-investors'),
        output: resolve(values.output ?? 'public/data/shared-investors'),
        offline: values.offline,
      }),
      null,
      2,
    ),
  );
} else if (positionals[0] === 'holdings') {
  console.log(
    JSON.stringify(
      await runHoldings({
        input: values.input ? JSON.parse(await readFile(resolve(values.input), 'utf8')) : undefined,
        plan: values.plan ? JSON.parse(await readFile(resolve(values.plan), 'utf8')) : undefined,
        workspace: resolve(values.workspace ?? '.local/holdings'),
        output: resolve(values.output ?? 'public/data/holdings'),
        offline: values.offline,
      }),
      null,
      2,
    ),
  );
} else if (positionals[0] === 'insiders') {
  console.log(
    JSON.stringify(
      await runInsiders({
        input: values.input ? JSON.parse(await readFile(resolve(values.input), 'utf8')) : undefined,
        plan: values.plan ? JSON.parse(await readFile(resolve(values.plan), 'utf8')) : undefined,
        workspace: resolve(values.workspace ?? '.local/insiders'),
        output: resolve(values.output ?? 'public/data/insiders'),
        offline: values.offline,
      }),
      null,
      2,
    ),
  );
} else if (positionals[0] === 'water') {
  console.log(
    JSON.stringify(
      await runWater({
        input: values.input ? JSON.parse(await readFile(resolve(values.input), 'utf8')) : undefined,
        plan: values.plan ? JSON.parse(await readFile(resolve(values.plan), 'utf8')) : undefined,
        workspace: resolve(values.workspace ?? '.local/water'),
        output: resolve(values.output ?? 'public/data/water'),
        offline: values.offline,
      }),
      null,
      2,
    ),
  );
} else if (positionals[0] === 'echo') {
  const result = await runEcho({
    input: values.input ? JSON.parse(await readFile(resolve(values.input), 'utf8')) : undefined,
    plan: values.plan ? JSON.parse(await readFile(resolve(values.plan), 'utf8')) : undefined,
    workspace: resolve(values.workspace ?? '.local/echo'),
    output: resolve(values.output ?? 'public/data/echo'),
    offline: values.offline,
  });
  console.log(JSON.stringify(result, null, 2));
} else if (positionals[0] === 'paycheck-calc') {
  const raw = JSON.parse(await readFile(resolve(values.input!), 'utf8')),
    data = paycheckDataSchema.parse(raw),
    recipe = JSON.parse(await readFile(resolve(values.plan!), 'utf8'));
  if (recipe.datasetHash && recipe.datasetHash !== hash(raw))
    throw new Error('Calculation belongs to a different paycheck snapshot');
  const result = analyzePaycheck(data, recipe.configuration ?? recipe),
    output = resolve(values.output ?? '.local/paycheck-calculation.json');
  await writeAtomic(output, {
    formatVersion: 1,
    datasetHash: hash(raw),
    release: `pc-${hash(raw).slice(0, 24)}`,
    configuration: result.configuration,
    result,
    regions: paycheckRegions(data, result.configuration),
  });
  console.log(
    JSON.stringify({
      output,
      realEarningsChange: result.selected.real,
      employmentChange: result.selected.employment,
    }),
  );
} else if (positionals[0] === 'chart') {
  const raw = JSON.parse(await readFile(resolve(values.input!), 'utf8')),
    data = economyDataSchema.parse(raw),
    recipe = JSON.parse(await readFile(resolve(values.plan!), 'utf8'));
  if (recipe.datasetHash && recipe.datasetHash !== hash(raw))
    throw new Error('Calculation belongs to a different frozen dataset');
  const configuration = chartConfigSchema.parse(recipe.configuration ?? recipe);
  const result = {
    formatVersion: 1,
    datasetHash: hash(raw),
    release: `ec-${hash(raw).slice(0, 24)}`,
    configuration,
    result: analyzeChart(data, configuration),
    alternatives: alternativeWindows(data, configuration),
  };
  const output = resolve(values.output ?? '.local/chart-calculation.json');
  await writeAtomic(output, result);
  console.log(
    JSON.stringify({ output, change: result.result.change, unit: result.result.changeUnit }),
  );
} else if (positionals[0] === 'nursing') {
  console.log(
    JSON.stringify(
      await runNursing({
        ...(values.input
          ? { input: JSON.parse(await readFile(resolve(values.input), 'utf8')) }
          : { plan: JSON.parse(await readFile(resolve(values.plan!), 'utf8')) }),
        workspace: resolve(values.workspace ?? '.local/nursing'),
        output: resolve(values.output ?? 'public/data/nursing'),
        offline: values.offline,
      }),
      null,
      2,
    ),
  );
} else if (positionals[0] === 'graveyard') {
  console.log(
    JSON.stringify(
      await runGraveyard({
        ...(values.input
          ? { input: JSON.parse(await readFile(resolve(values.input), 'utf8')) }
          : { plan: JSON.parse(await readFile(resolve(values.plan!), 'utf8')) }),
        workspace: resolve(values.workspace ?? '.local/graveyard'),
        output: resolve(values.output ?? 'public/data/graveyard'),
        offline: values.offline,
      }),
      null,
      2,
    ),
  );
} else if (positionals[0] === 'revolving') {
  console.log(
    JSON.stringify(
      await runRevolving({
        ...(values.input
          ? { input: JSON.parse(await readFile(resolve(values.input), 'utf8')) }
          : { plan: JSON.parse(await readFile(resolve(values.plan!), 'utf8')) }),
        workspace: resolve(values.workspace ?? '.local/revolving'),
        output: resolve(values.output ?? 'public/data/revolving'),
        offline: values.offline,
      }),
      null,
      2,
    ),
  );
} else if (positionals[0] === 'lobbying') {
  console.log(
    JSON.stringify(
      await runLobbying({
        ...(values.input
          ? { input: JSON.parse(await readFile(resolve(values.input), 'utf8')) }
          : { plan: JSON.parse(await readFile(resolve(values.plan!), 'utf8')) }),
        workspace: resolve(values.workspace ?? '.local/lobbying'),
        output: resolve(values.output ?? 'public/data/lobbying'),
        offline: values.offline,
      }),
      null,
      2,
    ),
  );
} else if (positionals[0] === 'wages') {
  const states = JSON.parse(
    await readFile(resolve(siteRoot, 'public/data/manifest.json'), 'utf8'),
  ).states;
  console.log(
    JSON.stringify(
      await runWages({
        ...(values.input
          ? {
              input: JSON.parse(await readFile(resolve(values.input), 'utf8')),
              archiveDirectory: dirname(resolve(values.input)),
            }
          : { plan: JSON.parse(await readFile(resolve(values.plan!), 'utf8')) }),
        states,
        workspace: resolve(values.workspace ?? '.local/wages'),
        output: resolve(values.output ?? 'public/data/wages'),
        offline: values.offline,
      }),
      null,
      2,
    ),
  );
} else if (positionals[0] === 'complaints') {
  const states = JSON.parse(
    await readFile(resolve(siteRoot, 'public/data/manifest.json'), 'utf8'),
  ).states;
  console.log(
    JSON.stringify(
      await runComplaints({
        ...(values.input
          ? { input: JSON.parse(await readFile(resolve(values.input), 'utf8')) }
          : { plan: JSON.parse(await readFile(resolve(values.plan!), 'utf8')) }),
        states,
        workspace: resolve(values.workspace ?? '.local/complaints'),
        output: resolve(values.output ?? 'public/data/complaints'),
        offline: values.offline,
      }),
      null,
      2,
    ),
  );
} else if (positionals[0] === 'paycheck') {
  const states = JSON.parse(
    await readFile(resolve(siteRoot, 'public/data/manifest.json'), 'utf8'),
  ).states;
  console.log(
    JSON.stringify(
      await runPaycheck({
        ...(values.input
          ? { input: JSON.parse(await readFile(resolve(values.input), 'utf8')) }
          : { plan: JSON.parse(await readFile(resolve(values.plan!), 'utf8')) }),
        states,
        workspace: resolve(values.workspace ?? '.local/paycheck'),
        output: resolve(values.output ?? 'public/data/paycheck'),
        offline: values.offline,
      }),
      null,
      2,
    ),
  );
} else if (positionals[0] === 'research') {
  const states = JSON.parse(
    await readFile(resolve(siteRoot, 'public/data/manifest.json'), 'utf8'),
  ).states;
  console.log(
    JSON.stringify(
      await runResearch({
        ...(values.input
          ? { input: JSON.parse(await readFile(resolve(values.input), 'utf8')) }
          : { plan: JSON.parse(await readFile(resolve(values.plan!), 'utf8')) }),
        states,
        workspace: resolve(values.workspace ?? '.local/research'),
        output: resolve(values.output ?? 'public/data/research'),
        offline: values.offline,
      }),
      null,
      2,
    ),
  );
} else if (positionals[0] === 'economy') {
  const states = JSON.parse(
    await readFile(resolve(siteRoot, 'public/data/manifest.json'), 'utf8'),
  ).states;
  console.log(
    JSON.stringify(
      await runEconomy({
        ...(values.input
          ? { input: JSON.parse(await readFile(resolve(values.input), 'utf8')) }
          : { plan: JSON.parse(await readFile(resolve(values.plan!), 'utf8')) }),
        states,
        workspace: resolve(values.workspace ?? '.local/economy'),
        output: resolve(values.output ?? 'public/data/economy'),
        offline: values.offline,
      }),
      null,
      2,
    ),
  );
} else if (positionals[0] === 'rules') {
  console.log(
    JSON.stringify(
      await runRules({
        ...(values.input
          ? { input: JSON.parse(await readFile(resolve(values.input), 'utf8')) }
          : { plan: JSON.parse(await readFile(resolve(values.plan!), 'utf8')) }),
        workspace: resolve(values.workspace ?? '.local/rules'),
        output: resolve(values.output ?? 'public/data/rules'),
        offline: values.offline,
      }),
      null,
      2,
    ),
  );
} else if (positionals[0] === 'trials') {
  const states = JSON.parse(
    await readFile(resolve(siteRoot, 'public/data/manifest.json'), 'utf8'),
  ).states;
  console.log(
    JSON.stringify(
      await runTrials({
        ...(values.input
          ? { input: JSON.parse(await readFile(resolve(values.input), 'utf8')) }
          : { plan: JSON.parse(await readFile(resolve(values.plan!), 'utf8')) }),
        workspace: resolve(values.workspace ?? '.local/trials'),
        output: resolve(values.output ?? 'public/data/trials'),
        offline: values.offline,
        states,
      }),
      null,
      2,
    ),
  );
} else {
  const input = values.input
    ? JSON.parse(await readFile(resolve(values.input), 'utf8'))
    : (
        await collectSources(JSON.parse(await readFile(resolve(values.plan!), 'utf8')), {
          workspace: resolve(values.workspace ?? '.local/votes'),
          offline: values.offline,
          inputDirectory: dirname(resolve(values.plan!)),
        })
      ).corpus;
  console.log(
    JSON.stringify(
      await publishVoteReceipts(input, resolve(values.output ?? 'public/data/votes')),
      null,
      2,
    ),
  );
}
