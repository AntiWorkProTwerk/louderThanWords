import { type WageData, wageSummarySchema } from '../../src/lib/civic/wages';
import { wageIndexFields, wageIndexSchema, wageShard } from '../../src/lib/civic/wage-index';
import { hash } from '../said-did/engine';

export function wageAttachments(data: WageData) {
  const dataHash = hash(data),
    { records, ...header } = data;
  const groups = new Map<string, typeof records>();
  for (const record of records) {
    const path = wageShard(record.id),
      group = groups.get(path) ?? [];
    group.push(record);
    groups.set(path, group);
  }
  const index = wageIndexSchema.parse({
    ...header,
    indexVersion: 'wage-browser-v1',
    dataHash,
    fields: wageIndexFields,
    rows: records.map((record) => {
      const summary = wageSummarySchema.parse(record);
      return wageIndexFields.map((field) => summary[field]);
    }),
  });
  return Object.fromEntries([
    ['index-v1.json', index],
    ...[...groups]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([path, records]) => [path, { indexVersion: 'wage-browser-v1', dataHash, records }]),
  ]);
}
