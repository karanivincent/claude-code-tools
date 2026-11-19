// Run: node --test general-tools/skills/toon-world/kit/world.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inkSetting, checkInk, activeRims, checkRims, checkSaturation, checkEmissive, mdTables, frameTokens, checkSceneFrames, checkProbes, checkLightSources, nightScenes } from './world.ts';

// the template's stage.tsx (ink on) and hannibal-oxen's (ink read from the place), cut down to the lines that matter
const TEMPLATE_STAGE = `// Post toggles for checks: --props '{"post":{"ink":false}}'
type Post = { ink: boolean; lens: boolean };
const on = useMemo<Post>(() => ({ ink: true, lens: true, bloom: true, grade: true, ...(props().post ?? {}) }), []);
const fx = useMemo(() => ({ ink: new InkPass(scene, camera as THREE.PerspectiveCamera), lens: new LensBlur({}) }), []);`;
const PLACE_STAGE = TEMPLATE_STAGE.replace('ink: true,', 'ink: place.ink,');
const used = { s01: 'camp', s02: 'camp', s03: 'tent' };

test('S3-213 ink: the template stage fails, a stage reading the place passes when every place says ink: false', () => {
  assert.equal(inkSetting(TEMPLATE_STAGE), 'on');
  assert.match(checkInk(TEMPLATE_STAGE, {}, used)[0].what, /turns the ink pass on/);
  assert.equal(inkSetting(PLACE_STAGE), 'per-place');
  assert.deepEqual(checkInk(PLACE_STAGE, { camp: { ink: false }, tent: { ink: false } }, used), []);
  const bad = checkInk(PLACE_STAGE, { camp: { ink: false }, tent: { ink: true } }, used);
  assert.equal(bad.length, 1); assert.equal(bad[0].scene, 's03');
  assert.equal(inkSetting(TEMPLATE_STAGE.replace('ink: true,', 'ink: false,')), 'off');
  assert.equal(inkSetting('const x = 1;'), 'none', 'no InkPass at all');
  assert.equal(inkSetting(TEMPLATE_STAGE.replace('ink: true,', 'ink: someFlag,')), 'unknown');
});

test('S3-224 rims: rims.on, a cool rim and a warm card tint each draw a rim; flat cards pass', () => {
  const DUSK = { rims: { on: 1, width: 3, cool: 0.55 }, charTint: [1.04, 0.92, 0.84] as [number, number, number] };
  assert.equal(activeRims(DUSK).length, 2);
  // hannibal-oxen's base: rims.on 0 but RIM_DUSK's cool rim kept
  assert.match(activeRims({ ...DUSK, rims: { ...DUSK.rims, on: 0 } })[0], /cool rim/);
  // LIGHTS.golden's warm tint turns the warm rim on with rims.on 0 (cardshade: max(uRimOn, smoothstep(0.2, 0.4, 1 - b)))
  assert.match(activeRims({ rims: { on: 0, width: 2, cool: 0 }, charTint: [1, 0.78, 0.56] })[0], /warm card tint/);
  assert.deepEqual(activeRims({ rims: { on: 0, width: 2, cool: 0 }, charTint: [1, 0.95, 0.9] }), []);
  assert.deepEqual(activeRims({ rims: { on: 1, width: 0, cool: 1 } }), [], 'width 0 draws nothing');
  assert.equal(checkRims({ camp: { light: DUSK }, tent: { light: { rims: { on: 0, width: 2, cool: 0 } } } }, used).length, 2, 'once per place');
  assert.deepEqual(checkRims({ camp: { light: DUSK, people: { flat: [1, 1, 1] } }, tent: { light: { rims: { on: 0, width: 2, cool: 0 } } } }, used), []);
});

test('S3-206 saturation: a place light with sat under 1 fails once per place; 1 or more, or no sat, passes', () => {
  const used2 = { s01: 'camp', s02: 'camp', s03: 'tent', s04: 'hill' };
  const f = checkSaturation({ camp: { light: { sat: 0.92 } }, tent: { light: { sat: 1.04 } }, hill: { light: {} } }, used2);
  assert.equal(f.length, 1); assert.equal(f[0].rule, 'S3-206'); assert.equal(f[0].place, 'camp'); assert.match(f[0].what, /0\.92/);
  assert.deepEqual(checkSaturation({ camp: { light: { sat: 1 } } }, used2), []);
});

test('S3-223 emissive: a card with an emissive colour or intensity fails; zeros pass', () => {
  const good = `m.emissive.set(0x000000); m.emissiveIntensity = 0; m.emissiveMap = null;\nconst x = { emissive: '#000000' };`;
  assert.deepEqual(checkEmissive({ 'cardshade.ts': good }), []);
  const bad = checkEmissive({ 'cast.ts': `new THREE.MeshLambertMaterial({ map, emissive: 0xffffff, emissiveIntensity: 0.6 })\n// emissive: 0xff0000 in a comment` });
  assert.equal(bad.length, 2); assert.match(bad[0].what, /cast\.ts:1/);
  assert.equal(checkEmissive({ 'cast.ts': `card.mat.emissive.set('#ffeedd');` }).length, 1);
});

const SCENES_MD = `# scenes

| Scene | Seconds | Reference frame (same kind and light) |
|---|---|---|
| s01 | 0 to 7 | s011 for the kind, s113 for the light |
| s02 | 7 to 14 | \`stories/x/ref/camp-night.jpg\` |
| s03 | 14 to 20 | TODO |
`;
test('S2-37 reference frames: a table row per scene naming frames that are on disk', () => {
  assert.equal(mdTables(SCENES_MD)[0].rows.length, 3);
  assert.deepEqual(frameTokens('s011 for the kind, s113 for the light'), { paths: [], ids: ['s011', 's113'] });
  assert.deepEqual(frameTokens('`stories/x/ref/camp-night.jpg`').paths, ['stories/x/ref/camp-night.jpg']);
  const disk = new Set(['s011', 's113', 'stories/x/ref/camp-night.jpg']);
  const bad = checkSceneFrames({ 'scenes.md': SCENES_MD }, ['s01', 's02', 's03', 's04'], (t) => disk.has(t));
  assert.deepEqual(bad.map((f) => f.scene), ['s03', 's04'], 'a TODO cell and a scene with no row');
  assert.deepEqual(checkSceneFrames({ 'scenes.md': SCENES_MD }, ['s01', 's02'], (t) => disk.has(t)), []);
  const gone = checkSceneFrames({ 'scenes.md': SCENES_MD }, ['s01'], (t) => t !== 's113');
  assert.match(gone[0].what, /"s113" of s01 is not on disk/);
});

test('S3-231 probe stills: one per place a scene uses', () => {
  assert.deepEqual(checkProbes(used, (p) => (p === 'camp' ? ['probe.jpg'] : ['probe-wide.png'])), []);
  const bad = checkProbes(used, (p) => (p === 'camp' ? ['probe.jpg'] : ['still.jpg']));
  assert.equal(bad.length, 1); assert.equal(bad[0].place, 'tent');
});

test('S3-191 light sources: a section or a table row naming a source in the place and its side', () => {
  const parts = `## camp\n\n- Far band: the hills\n- Light: the camp fire, from screen left, warm pools on the ground\n\n## tent\n\n- Light: TODO\n`;
  const bad = checkLightSources({ 'parts.md': parts }, ['camp', 'tent', 'field']);
  assert.deepEqual(bad.map((f) => f.place), ['tent', 'field']);
  // hannibal-oxen's plan: a light table with a "Source and side" column, rows named in prose
  const plan = `| Light | Scenes | Source and side |\n|---|---|---|\n| fire close | s05 | The torch in frame, faces warm from below |\n| Fabius's tent | s08 | The lamp inside the tent, behind and beside him |\n| firstLight | s08 | Pale sky over the far ridge, no sun yet |\n`;
  assert.deepEqual(checkLightSources({ 'plan.md': plan }, ['fireClose', 'fabiusTent', 'firstLight']).map((f) => f.place), ['firstLight'], 'a source with no side');
});

test('night scenes: a place or its light says night, or the scene is named', () => {
  const places = { camp: { light: { night: true } }, tent: {} };
  assert.deepEqual(nightScenes(places, used), ['s01', 's02']);
  assert.deepEqual(nightScenes({ camp: {}, tent: {} }, used, ['s03']), ['s03']);
  assert.deepEqual(nightScenes({ camp: {}, tent: { night: true } }, used), ['s03']);
});
