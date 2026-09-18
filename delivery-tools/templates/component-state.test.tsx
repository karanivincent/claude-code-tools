/**
 * Component render test for one plan state no capture can reach (delivery-tools spec 6.3): a
 * `prop` state, an `action` state verified by test, or an `unseedable` state. The owning builder
 * copies this file to the path the plan row names (`reach.test.file`), keeps the test name the row
 * names (`reach.test.name`), and fills the places marked `delivery:` (the module path appears twice).
 *
 * `delivery gate` checks, mechanically: this file contains every marker string of the state; it
 * passes; and it FAILS when the component renders nothing. For that last run the gate sets
 * DELIVERY_RENDER_EMPTY=1, and the mock below replaces every export of the component's module with
 * one that renders null. So assert every marker here, and nothing an empty render would satisfy.
 */
import type { ComponentProps } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
// delivery: the component under test (the plan row's `component`), imported as ComponentUnderTest.
import { ComponentUnderTest } from '__COMPONENT_MODULE__';

// Keep this block as it is. Under DELIVERY_RENDER_EMPTY=1 every function the module exports renders
// nothing, which is how the gate proves this test fails on an empty component.
// delivery: the same module path as the import above.
vi.mock('__COMPONENT_MODULE__', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  if (process.env.DELIVERY_RENDER_EMPTY !== '1') return actual;
  return Object.fromEntries(Object.entries(actual).map(([name, value]) => [name, typeof value === 'function' ? () => null : value]));
});

// delivery: the state id and its markers, copied verbatim from the plan row's `markers`.
const STATE = '__STATE_ID__';
const MARKERS: { text: string[]; testids: string[]; forbidden: string[] } = {
  text: [],
  testids: [],
  forbidden: [],
};

// delivery: fixture props that put the component in this state. Fake data only: no real names,
// numbers or addresses, and phone-shaped values from the safety file's fake range.
const PROPS = {} as ComponentProps<typeof ComponentUnderTest>;

describe(`${STATE}`, () => {
  it(`${STATE} shows its markers and none of its siblings'`, () => {
    render(<ComponentUnderTest {...PROPS} />);
    expect(MARKERS.text.length + MARKERS.testids.length).toBeGreaterThan(0);
    for (const text of MARKERS.text) expect(screen.getAllByText(text, { exact: false }).length).toBeGreaterThan(0);
    for (const id of MARKERS.testids) expect(screen.getByTestId(id)).toBeTruthy();
    for (const f of MARKERS.forbidden) {
      expect(screen.queryAllByText(f, { exact: false })).toHaveLength(0);
      expect(screen.queryAllByTestId(f)).toHaveLength(0);
    }
  });
});
