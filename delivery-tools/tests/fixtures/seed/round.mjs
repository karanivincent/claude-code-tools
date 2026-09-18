// A synthetic twin of the unsafe design seed a real build once shipped (spec 7's opening): a
// running round of outbound calls, some queued past their release time, some still ahead, every
// number in a dialable format; plus practice runs whose phone numbers are masked. Generic words,
// fictional 555 numbers. Clock pinned at NOW.

export const NOW = '2026-01-15T12:00:00.000Z';
export const ORG = '00000000-0000-5000-8000-0000000000a1';
export const BATCH = '00000000-0000-5000-8000-0000000000b1';

const id = (n) => `00000000-0000-5000-8000-${String(n).padStart(12, '0')}`;
const minutes = (m) => new Date(Date.parse(NOW) + m * 60_000).toISOString();

/** Rows as a dry run would list them: { world, table, id, values }. */
export function unsafeRoundRows() {
  const rows = [];
  rows.push({ world: 'dry-run', table: 'outbound_batches', id: BATCH, values: { id: BATCH, organization_id: ORG, status: 'running', label: 'Widget round' } });
  let n = 100;
  const call = (status, release, phone) => {
    const rid = id(n++);
    rows.push({ world: 'dry-run', table: 'outbound_calls', id: rid, values: {
      id: rid, organization_id: ORG, batch_id: BATCH, status, release_at: release, phone_number: phone,
      subject: { customer: `Customer ${n}`, order_number: `48${n}` },
    } });
    return rid;
  };
  const ids = { done: [], queuedPast: [], queuedLater: [], localRange: [], e164Range: [] };
  for (let k = 1; k <= 12; k++) { const r = call('done', minutes(-120 + k), `0555010${String(k).padStart(4, '0')}`); ids.done.push(r); ids.localRange.push(r); }
  for (let k = 1; k <= 5; k++) { const r = call('queued', minutes(-30 + k), `0555010${String(100 + k).padStart(4, '0')}`); ids.queuedPast.push(r); ids.localRange.push(r); }
  for (let k = 1; k <= 3; k++) { const r = call('queued', minutes(60 * 24 * k), `+1555010${String(k).padStart(4, '0')}`); ids.queuedLater.push(r); ids.e164Range.push(r); }
  for (let k = 1; k <= 3; k++) {
    const rid = id(n++);
    rows.push({ world: 'dry-run', table: 'practice_runs', id: rid, values: {
      id: rid, organization_id: ORG, mode: 'to_phone', status: 'completed', to_number: '+1555•••0001', created_at: minutes(-600),
    } });
  }
  return { rows, ids };
}

/** One practice run left queued and deferred, on a never-dial number (spec 20.2's synthetic row). */
export function deferredPracticeRow(neverDialNumber) {
  return {
    world: 'dry-run', table: 'practice_runs', id: id(900),
    values: { id: id(900), organization_id: ORG, mode: 'to_phone', status: 'queued', deferred_at: minutes(-60), to_number: neverDialNumber, created_at: minutes(-61) },
  };
}
