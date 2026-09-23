// M15: the served SHA equals the expected SHA for every capture (spec 6.2 item 3, 8.1). It refuses
// the capture rather than filing a finding: a capture of the wrong build proves nothing, so every
// mismatch is a failure line, and M3 then counts those states as not reached.

/** Whether two SHAs name the same commit (either may be abbreviated, at least 7 characters). */
export function sameSha(a, b) {
  const x = String(a ?? '').trim().toLowerCase();
  const y = String(b ?? '').trim().toLowerCase();
  if (x.length < 7 || y.length < 7 || !/^[0-9a-f]+$/.test(x) || !/^[0-9a-f]+$/.test(y)) return false;
  return x.startsWith(y) || y.startsWith(x);
}

export default {
  id: 'M15',
  needsCapture: true,
  async run(env) {
    const expected = env.capture.doc.expectedSha;
    const wrong = env.capture.items.filter((i) => !sameSha(i.item.servedSha, expected));
    const failures = wrong.map((i) => ({
      code: 'M15',
      message: `${env.capture.runId} ${i.key}: served ${i.item.servedSha || 'no SHA'}, expected ${expected}; this capture is refused`,
    }));
    return { findings: [], failures };
  },
};
