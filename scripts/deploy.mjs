import { execFileSync } from 'node:child_process';

const production = !process.argv.includes('--preview');
const currentBranch = execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim();
let branch = 'main';

if (!production) {
  branch = currentBranch;
  if (!branch) {
    throw new Error('Preview deploys require a checked-out Git branch.');
  }
} else if (currentBranch !== 'main') {
  throw new Error(
    `Production deploys are only allowed from main (currently on ${currentBranch || 'a detached commit'}). ` +
      'Use npm run deploy:preview for this branch.',
  );
}

const npmCli = process.env.npm_execpath;

if (!npmCli) throw new Error('Run this deployment through npm so the npm executable can be located.');

execFileSync(process.execPath, [npmCli, 'run', 'build'], { stdio: 'inherit' });

const args = production
  ? ['wrangler', 'deploy']
  : [
      'wrangler',
      'versions',
      'upload',
      '--preview-alias',
      branch.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '').slice(0, 63),
    ];

execFileSync(process.execPath, [npmCli, 'exec', '--', ...args], { stdio: 'inherit' });
