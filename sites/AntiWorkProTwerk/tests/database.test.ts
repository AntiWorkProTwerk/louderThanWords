import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('database policies isolate notes and enforce subscription access; webhooks tolerate duplicates and stale events', async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;`,
    );
    await db.exec(
      'alter default privileges in schema public grant all on tables to anon, authenticated',
    );
    await db.exec(
      await readFile(
        new URL('../supabase/migrations/001_civic_foundation.sql', import.meta.url),
        'utf8',
      ),
    );
    const alice = '11111111-1111-4111-8111-111111111111',
      bob = '22222222-2222-4222-8222-222222222222';
    await db.query('insert into auth.users(id) values ($1),($2)', [alice, bob]);
    await db.exec("insert into public.premium_analysis values('cruz','Private analysis',now())");
    await db.exec('set role authenticated');
    await assert.rejects(() => db.exec('truncate public.saved_politicians'), /permission denied/);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [alice]);
    await db.query(
      "insert into public.saved_politicians(user_id,politician_id,name,state,note)values($1,'cruz','Ted Cruz','TX','Alice private note')",
      [alice],
    );
    await assert.rejects(
      () =>
        db.query(
          "insert into public.saved_politicians(user_id,politician_id,name,state)values($1,'cruz','Ted Cruz','TX')",
          [bob],
        ),
      /row-level security/,
    );
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [bob]);
    assert.equal((await db.query('select * from public.saved_politicians')).rows.length, 0);
    assert.equal((await db.query('select * from public.premium_analysis')).rows.length, 0);
    await assert.rejects(
      () =>
        db.query(
          "insert into public.subscriptions values('fake',$1,'customer','active',now()+interval '1 year',100,now())",
          [bob],
        ),
      /permission denied/,
    );
    await db.exec('reset role');
    const event = (id: string, time: number, status: string) =>
      db.query(
        "select public.record_subscription_event($1,$2,'sub_test',$3,'cus_test',$4,now()+interval '1 year')",
        [id, time, alice, status],
      );
    await event('evt_active', 200, 'active');
    await event('evt_stale', 100, 'canceled');
    await event('evt_active', 300, 'canceled');
    assert.equal(
      (await db.query<{ status: string }>("select status from subscriptions where id='sub_test'"))
        .rows[0].status,
      'active',
    );
    assert.equal((await db.query('select * from stripe_events')).rows.length, 2);
    await db.exec('set role authenticated');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [alice]);
    assert.equal((await db.query('select * from premium_analysis')).rows.length, 1);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [bob]);
    assert.equal((await db.query('select * from premium_analysis')).rows.length, 0);
    await db.exec('reset role');
    await event('evt_cancel', 400, 'canceled');
    await db.exec('set role authenticated');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [alice]);
    assert.equal((await db.query('select * from premium_analysis')).rows.length, 0);
  } finally {
    await db.close();
  }
});
