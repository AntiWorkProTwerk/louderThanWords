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

execFileSync('npm', ['run', 'build'], { stdio: 'inherit', shell: process.platform === 'win32' });

const args = production
  ? ['wrangler', 'deploy']
  : ['wrangler', 'versions', 'upload', '--preview-alias', branch];

execFileSync('npx', args, { stdio: 'inherit', shell: process.platform === 'win32' });
