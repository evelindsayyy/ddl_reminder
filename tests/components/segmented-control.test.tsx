// @vitest-environment jsdom
//
// Component test for the shared SegmentedControl (`components/ui/SegmentedControl.tsx`),
// extracted verbatim from AssignmentsView. Pins the WAI-ARIA tablist contract:
// role/aria-selected wiring plus the roving-tabindex arrow/Home/End keyboard
// behavior (Left/Right wrap; Home/End jump). Runs the component REAL — the only
// seam is the onChange spy, so selection changes are observed end-to-end.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

import { SegmentedControl } from '@/components/ui/SegmentedControl';

type View = 'list' | 'calendar' | 'timeline';

const OPTIONS: { value: View; label: string }[] = [
  { value: 'list', label: 'list' },
  { value: 'calendar', label: 'calendar' },
  { value: 'timeline', label: 'timeline' },
];

function renderControl(value: View, onChange = vi.fn()) {
  render(
    <SegmentedControl<View> label="View mode" options={OPTIONS} value={value} onChange={onChange} />,
  );
  return onChange;
}

afterEach(() => {
  cleanup();
});

describe('SegmentedControl', () => {
  it('renders every option as a tab inside a labelled tablist', () => {
    renderControl('list');
    const tablist = screen.getByRole('tablist', { name: 'View mode' });
    expect(tablist).toBeTruthy();
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['list', 'calendar', 'timeline']);
  });

  it('marks only the selected tab aria-selected and roving-focusable', () => {
    renderControl('calendar');
    const selected = screen.getByRole('tab', { selected: true });
    expect(selected.textContent).toBe('calendar');
    // Roving tabindex: the active tab is 0, the rest are -1.
    expect(selected.getAttribute('tabindex')).toBe('0');
    expect(screen.getByRole('tab', { name: 'list' }).getAttribute('tabindex')).toBe('-1');
    expect(screen.getByRole('tab', { name: 'timeline' }).getAttribute('tabindex')).toBe('-1');
  });

  it('ArrowRight moves selection to the next option', () => {
    const onChange = renderControl('list');
    fireEvent.keyDown(screen.getByRole('tab', { name: 'list' }), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledWith('calendar');
  });

  it('ArrowRight wraps from the last option back to the first', () => {
    const onChange = renderControl('timeline');
    fireEvent.keyDown(screen.getByRole('tab', { name: 'timeline' }), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledWith('list');
  });

  it('ArrowLeft moves selection to the previous option', () => {
    const onChange = renderControl('calendar');
    fireEvent.keyDown(screen.getByRole('tab', { name: 'calendar' }), { key: 'ArrowLeft' });
    expect(onChange).toHaveBeenCalledWith('list');
  });

  it('ArrowLeft wraps from the first option to the last', () => {
    const onChange = renderControl('list');
    fireEvent.keyDown(screen.getByRole('tab', { name: 'list' }), { key: 'ArrowLeft' });
    expect(onChange).toHaveBeenCalledWith('timeline');
  });

  it('Home jumps to the first option and End jumps to the last', () => {
    const onChangeHome = renderControl('timeline');
    fireEvent.keyDown(screen.getByRole('tab', { name: 'timeline' }), { key: 'Home' });
    expect(onChangeHome).toHaveBeenCalledWith('list');
    cleanup();

    const onChangeEnd = renderControl('list');
    fireEvent.keyDown(screen.getByRole('tab', { name: 'list' }), { key: 'End' });
    expect(onChangeEnd).toHaveBeenCalledWith('timeline');
  });

  it('clicking a tab selects it', () => {
    const onChange = renderControl('list');
    fireEvent.click(screen.getByRole('tab', { name: 'timeline' }));
    expect(onChange).toHaveBeenCalledWith('timeline');
  });
});
