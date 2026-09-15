import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { createClient } from '@supabase/supabase-js';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { prepareRelease, siteRoot } from './pipeline';
import { politicianSchema } from '../src/lib/data/schema';
import { source } from './fixtures/demo';

export async function publishRemote() {
  const required = [
    'R2_ACCOUNT_ID',
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
    'R2_BUCKET',
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
  ];
  if (required.some((key) => !process.env[key]))
    throw new Error('R2 and Supabase publishing credentials are required.');
  if (process.env.ALLOW_DEMO_PUBLISH !== 'true')
    throw new Error(
      'This pipeline contains demo data. Set ALLOW_DEMO_PUBLISH=true only for a demo environment.',
    );
  const { manifest, files } = await prepareRelease();
  const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  const r2 = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
  const bucket = process.env.R2_BUCKET!;
  async function store(key: string, body: string, immutable = true) {
    // Existing releases must remain byte-for-byte immutable on safe reruns.
    if (immutable) {
      try {
        await r2.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        const existing = await r2.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        if ((await existing.Body?.transformToString()) !== body)
          throw new Error(`Immutable object differs: ${key}`);
        return;
      } catch (error) {
        if ((error as { $metadata?: { httpStatusCode: number } }).$metadata?.httpStatusCode !== 404)
          throw error;
      }
    }
    await r2.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: key.endsWith('.geojson') ? 'application/geo+json' : 'application/json',
        CacheControl: immutable
          ? 'public, max-age=31536000, immutable'
          : 'public, max-age=60, must-revalidate',
        ...(immutable ? { IfNoneMatch: '*' } : {}),
      }),
    );
  }
  for (const name of ['states-10m.json', 'countries-50m.json'])
    await store(
      `archives/${manifest.release}/${name}`,
      await readFile(join(siteRoot, 'scripts/sources', name), 'utf8'),
    );
  await store(
    `archives/${manifest.release}/normalized-demo.json`,
    JSON.stringify({
      source,
      people: Object.entries(files)
        .filter(([key]) => key.startsWith('politicians/'))
        .map(([, value]) => JSON.parse(value)),
    }),
  );
  const checked = async (operation: PromiseLike<{ error: unknown }>) => {
    const { error } = await operation;
    if (error)
      throw new Error('Database preparation failed; the published manifest was not advanced.');
  };
  await checked(
    db
      .from('sources')
      .upsert({
        id: source.id,
        url: source.url,
        collected_at: source.collectedAt,
        transformation_version: source.transformationVersion,
        kind: source.kind,
        archive_key: `archives/${manifest.release}/normalized-demo.json`,
      }),
  );
  for (const [key, value] of Object.entries(files).filter(([key]) =>
    key.startsWith('politicians/'),
  )) {
    const p = politicianSchema.parse(JSON.parse(value));
    await checked(
      db
        .from('politicians')
        .upsert({
          id: p.id,
          state: p.state,
          name: p.name,
          party: p.party,
          summary: JSON.parse(value),
          source_id: source.id,
        }),
    );
    await checked(
      db.from('bills').upsert(p.bills.map((bill) => ({ ...bill, source_id: source.id }))),
    );
    await checked(
      db.from('votes').upsert(
        p.votes.map((v) => ({
          politician_id: p.id,
          bill_id: v.bill.id,
          vote: v.vote,
          voted_at: v.date,
          source_id: source.id,
        })),
        { onConflict: 'politician_id,bill_id,voted_at' },
      ),
    );
    await checked(
      db.from('donation_summaries').upsert(
        p.donors.map((d) => ({
          politician_id: p.id,
          category: d.category,
          amount: d.amount,
          source_id: source.id,
        })),
        { onConflict: 'politician_id,category,source_id' },
      ),
    );
  }
  await checked(db.rpc('refresh_civic_summaries'));
  for (const [name, body] of Object.entries(files))
    await store(`data/releases/${manifest.release}/${name}`, body);
  await checked(
    db
      .from('dataset_releases')
      .upsert({ id: manifest.release, published_at: manifest.publishedAt, manifest }),
  );
  // Only publish the pointer after all archive, validation, DB, and file writes succeed.
  await store('data/manifest.json', JSON.stringify(manifest), false);
  return { release: manifest.release, files: Object.keys(files).length };
}
