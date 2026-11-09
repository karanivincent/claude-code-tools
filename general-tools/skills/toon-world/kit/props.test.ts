// Run: node --test general-tools/skills/toon-world/kit/props.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { states, dial, checkStates } from './props.ts';

const near = (a: number, b: number, tol: number, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} is not within ${tol} of ${b}`);

test('a prop moves between named states on their frames and holds there', () => {
  const door = states({ SHUT: 0, AJAR: 0.25, OPEN: 1 }, 'SHUT');
  const at = door.track([{ f: 30, to: 'OPEN', over: 10 }, { f: 90, to: 'AJAR' }]);
  assert.equal(at(0), 0);
  assert.equal(door.nameOf(at(29)), 'SHUT');
  assert.equal(door.nameOf(at(35)), null, 'between states');
  assert.equal(door.nameOf(at(60)), 'OPEN');
  assert.equal(door.nameOf(at(120)), 'AJAR');
  assert.throws(() => door.track([{ f: 10, to: 'WIDE' as 'OPEN' }]), /no state named WIDE/);
});

test('a dial mark and the needle set to it point the same way', () => {
  const scale = dial(-120, 120), gauge = states({ EMPTY: 0, HALF: 0.5, FULL: 1 }, 'EMPTY');
  for (const name of ['EMPTY', 'HALF', 'FULL'] as const) {
    const reading = gauge.of(name);
    const [mx, my] = scale.pointAt(reading, 1);           // where the painted mark is
    const z = scale.needleZ(reading);                     // the needle, drawn pointing up (0, 1), turned by z
    const tip: [number, number] = [-Math.sin(z), Math.cos(z)];
    near(tip[0], mx, 1e-9, `${name} x`); near(tip[1], my, 1e-9, `${name} y`);
  }
});

test('the state check catches a needle half a turn off its FULL mark', () => {
  const gauge = states({ EMPTY: 0, OK: 0.85, FULL: 1 }, 'EMPTY'), scale = dial(-120, 120);
  const reading = gauge.track([{ f: 0, to: 'FULL', over: 1 }]);
  // the bug: the needle's angle typed by hand, half a turn from the painted mark
  const typedZ = (f: number) => scale.needleZ(reading(f)) - Math.PI;
  const shown = (f: number) => {
    const deg = -typedZ(f) / (Math.PI / 180);
    const a = ((deg + 180) % 360 + 360) % 360 - 180;       // the angle a viewer sees
    return (a + 120) / 240;                                 // the reading that angle means on this dial
  };
  assert.equal(checkStates(gauge, reading, [{ f: 60, is: 'FULL', word: 'full' }]).length, 0, 'the story value is FULL');
  const issues = checkStates(gauge, shown, [{ f: 60, is: 'FULL', word: 'full' }]);
  assert.equal(issues.length, 1);
  assert.match(issues[0].detail, /"full": expected FULL/);
});
