import { publishLocal } from './pipeline';
const manifest = await publishLocal();
console.log(
  `Published ${manifest.release}: ${manifest.states.length} state/territory summaries. All political data is illustrative.`,
);
