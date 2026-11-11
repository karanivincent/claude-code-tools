import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plainMeshes, smallTextures, detailCount, checkDetail, flatShare, cardMask, FLAT, type MeshInfo, type DetailFrame, type Rgb } from './look.ts';

const cams = [{ pos: [0, 1.6, 6] as [number, number, number] }];
const good: MeshInfo = { name: 'wall', c: [0, 1.5, -2], r: 4, map: true, emissive: false, maps: [{ slot: 'map', w: 2048, h: 2048, mipmaps: true, anisotropy: 16 }] };

test('plainMeshes: plain colour near the lens fails; maps, glows, cards, allowed and far meshes pass', () => {
  const plain: MeshInfo = { name: 'ground', c: [0, 0, 0], r: 30, map: false, emissive: false, maps: [] };
  const stones: MeshInfo = { name: 'two-tone stone', c: [1, 0.2, 2], r: 0.3, map: false, emissive: false, maps: [] };
  const far: MeshInfo = { name: 'hill', c: [0, 0, -80], r: 10, map: false, emissive: false, maps: [] };
  const ok: MeshInfo = { ...plain, name: 'cord', r: 1, plainOk: 'a cord 1.6 cm thick' };
  const glow: MeshInfo = { ...plain, name: 'embers', r: 0.3, emissive: true };
  const card: MeshInfo = { ...plain, name: 'widow', card: true };
  assert.deepEqual(plainMeshes([good, plain, stones, far, ok, glow, card], cams).map(i => i.name), ['ground', 'two-tone stone']);
  assert.equal(plainMeshes([{ ...ok, plainOk: '  ' }], cams).length, 1, 'an allow-list entry needs a reason');
});

test('smallTextures: under 2048, no mipmaps or anisotropy under 16 near the lens fail', () => {
  const elijah: MeshInfo = { ...good, name: 'plaster', maps: [{ slot: 'map', w: 1024, h: 1024, mipmaps: true, anisotropy: 16 }] };
  const critter: MeshInfo = { ...good, name: 'goat', maps: [{ slot: 'map', w: 256, h: 256, mipmaps: false, anisotropy: 1 }] };
  const out = smallTextures([good, elijah, critter], cams);
  assert.deepEqual(out.map(i => i.name), ['plaster', 'goat']);
  assert.match(out[1].what, /256 px.*no mipmaps.*anisotropy 1/);
  assert.equal(smallTextures([{ ...critter, c: [0, 0, -60], r: 1 }], cams).length, 0, 'far away: not judged');
});

test('detail: counts distinct things in frame per shot and which change; dots do not count', () => {
  const f = (t: number, shot: string, things: [string, string, boolean, string][], size: DetailFrame['size'] = 'wide'): DetailFrame =>
    ({ t, shot, size, things: things.map(([id, kind, inFrame, sig]) => ({ id, kind, inFrame, sig })) });
  // Elijah's house: motes, sparkles, a cat that never moved, a goat chewing
  const elijah = [0, 1].map(t => f(t, 'house', [['m', 'motes', true, `${t}`], ['s', 'sparkles', true, `${t}`], ['cat', 'cat', true, 'a'], ['goat', 'goat', true, `g${t}`]]));
  const d = detailCount(elijah);
  assert.deepEqual([d[0].present, d[0].moving], [2, 1]);
  assert.equal(checkDetail(elijah).length, 1);
  // the template's courtyard: six things in frame, all moving
  const kinds = ['flies', 'flies', 'smoke', 'cloth', 'cloth', 'birds'];
  const yard = [0, 1].map(t => f(t, 'wide', kinds.map((k, i) => [`d${i}`, k, true, `${k}${t}`] as [string, string, boolean, string])));
  assert.equal(checkDetail(yard).length, 0);
  // out of frame does not count; a close-up needs only 2 and 1
  const close = [0, 1].map(t => f(t, 'face', [['a', 'smoke', true, `${t}`], ['b', 'cloth', true, 'x'], ['c', 'birds', false, `${t}`]], 'close'));
  assert.equal(checkDetail(close).length, 0);
  assert.equal(checkDetail(close.map(x => ({ ...x, size: 'medium' as const }))).length, 1);
});

/** a 1080 x 1920 picture: plain fills (a flat place) or a painted grain over them */
function picture(painted: boolean, seed = 1): Rgb {
  const W = 540, H = 960, data = new Uint8Array(W * H * 3);
  let s = seed;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const base = y < H * 0.4 ? [156, 196, 228] : y < H * 0.75 ? [234, 215, 176] : [122, 154, 74];
    const n = painted ? (rnd() - 0.5) * 36 + 10 * Math.sin(x / 7 + y / 11) : 0;
    const i = (y * W + x) * 3;
    for (let c = 0; c < 3; c++) data[i + c] = Math.max(0, Math.min(255, base[c] + n));
  }
  return { width: W, height: H, data };
}

test('flatShare: a plain-filled frame is all flat; a painted one is not; cards are left out by the mask', () => {
  const flat = picture(false), paint = picture(true);
  assert.ok(flatShare(flat) > 0.95);
  assert.ok(flatShare(paint) < 0.05);
  assert.ok(flatShare(flat) > FLAT.max && flatShare(paint) < FLAT.max);
  // a flat card over the painted world: masked out, the world still passes
  const withCard = { ...paint, data: Uint8Array.from(paint.data) };
  for (let y = 300; y < 900; y++) for (let x = 100; x < 400; x++) { const i = (y * 540 + x) * 3; withCard.data[i] = 240; withCard.data[i + 1] = 200; withCard.data[i + 2] = 160; }
  assert.ok(flatShare(withCard) > 0.3, 'unmasked, the card reads flat');
  assert.ok(flatShare(withCard, { skip: cardMask(withCard, paint) }) < 0.05);
});
