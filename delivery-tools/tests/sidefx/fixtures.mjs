// Synthetic worker code and migrations for the side-effect map tests: a generic "outbound calls"
// product with practice runs, batches and widgets. Shapes follow real query-builder and plpgsql
// code (multi-line heads, casts, const arrays, a claim function with a not-exists guard).

export const WORKER_TS = `import { db } from '../db';

const OPEN = ['pending', 'running'] as const;

export async function resumeRuns(client: Client): Promise<number> {
  const { data } = await client
    .from('practice_runs')
    .select('id')
    .eq('status', 'queued')
    .not('deferred_at', 'is', null)
    .order('created_at');
  return data.length;
}

export async function countToday(
  client: Client,
  now: Date = new Date()
): Promise<number> {
  const { count } = await client
    .from('practice_runs')
    .select('id', { count: 'exact', head: true })
    .eq('mode', 'to_phone')
    .gte('created_at', now.toISOString());
  return count ?? 0;
}

const deps = {
  listOpen: async () => {
    const { data } = await (db as unknown as Client)
      .from('outbound_batches')
      .select('id')
      .in('status', OPEN);
    return data;
  },
  byId: async (id: string) => db.from('outbound_batches').select('*').eq('id', id),
};

export async function claim(client: Client, org: string) {
  const { data } = await client.rpc(
    'claim_outbound_calls',
    { p_org: org }
  );
  const bytes = Buffer.from('hello', 'utf8');
  const label = 'Don\\'t stop'; // an apostrophe inside a string
  return (client.from('widgets' as never) as any).update({ x: 1 }).match({ state: 'armed', kind: 3 });
}

class Sweeper {
  async sweep(client: Client) {
    await client.from('outbound_calls').delete().filter('status', 'in', '(stale,orphaned)');
  }
}
`;

export const MIGRATION_1 = `-- first definition
create or replace function claim_outbound_calls(p_org uuid, p_limit int)
returns setof outbound_calls
language plpgsql
as $$
declare
  v_mode text;
begin
  return query select * from outbound_calls where organization_id = p_org and status = 'ready';
end;
$$;
`;

export const MIGRATION_2 = `-- the latest definition wins
create or replace function claim_outbound_calls(p_org uuid, p_limit int)
returns setof outbound_calls
language plpgsql
security definer
as $$
declare
  v_mode   text;
  v_count  int;
begin
  select count(*) into v_count
  from outbound_calls
  where organization_id = p_org
    and status in ('dialing', 'in_progress');

  return query
  with due as (
    select c.id
    from outbound_calls c
    where c.organization_id = p_org
      and c.status = 'queued'
      and c.release_at <= now()
      and (v_mode = 'open' or exists (select 1 from allow_list a where a.org_id = c.organization_id))
      and not exists (
        select 1 from outbound_batches b
        where b.id = c.batch_id
          and b.status in ('paused', 'cancelled')
      )
    order by c.release_at
    for update skip locked
    limit p_limit
  )
  update outbound_calls c
     set status = 'dialing', claimed_at = now()
    from due
   where c.id = due.id
  returning c.*;
end;
$$;

create or replace function cleanup_runs()
returns void language sql as $$
  update practice_runs set status = 'failed';
  delete from practice_notes n where n.created_at < now() - interval '7 days' and n.kind between 1 and 3;
$$;
`;

export const WORKER_FILES = {
  'apps/server/src/jobs/sweep.ts': WORKER_TS,
  'db/migrations/20260101000000_first.sql': MIGRATION_1,
  'db/migrations/20260201000000_second.sql': MIGRATION_2,
  'apps/web/src/other.ts': "export const x = db.from('not_a_worker').eq('a', 'b');\n",
};
