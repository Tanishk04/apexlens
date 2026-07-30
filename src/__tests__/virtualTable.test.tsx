/** @jest-environment jsdom */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { VirtualTable, type Column } from '../app/components/VirtualTable';

interface Row {
  id: string;
  name: string;
}

const columns: Column<Row>[] = [
  { key: 'name', header: 'Name', get: (r) => r.name, grow: true },
];

const rows: Row[] = [
  { id: '1', name: 'First row long text that would wrap when expanded' },
  { id: '2', name: 'Second row long text that would wrap when expanded' },
];

/**
 * react-virtual's initial measurement reads offsetWidth/offsetHeight
 * (virtual-core's `getRect`), which jsdom reports as 0 by default — leaving no
 * rows rendered at all, regardless of row count. Give it real numbers so the
 * virtualized rows actually mount.
 */
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    value: 600,
  });
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
    configurable: true,
    value: 800,
  });
});

describe('VirtualTable — Expand All / Collapse All', () => {
  it('shows the bulk controls only when a column can grow/expand', () => {
    const { rerender } = render(
      <VirtualTable columns={columns} rows={rows} getKey={(r) => r.id} />,
    );
    expect(screen.getByTitle('Expand all')).toBeTruthy();
    expect(screen.getByTitle('Collapse all')).toBeTruthy();

    const noGrow: Column<Row>[] = [{ key: 'name', header: 'Name', get: (r) => r.name }];
    rerender(<VirtualTable columns={noGrow} rows={rows} getKey={(r) => r.id} />);
    expect(screen.queryByTitle('Expand all')).toBeNull();
  });

  it('expands every row on one click, and collapses every row on the other', () => {
    render(<VirtualTable columns={columns} rows={rows} getKey={(r) => r.id} />);

    const cellFor = (text: string) => screen.getByText(text, { exact: false });
    // Collapsed rows truncate; only expanded ones wrap the full text.
    expect(cellFor(rows[0]!.name).className).toContain('truncate');
    expect(cellFor(rows[1]!.name).className).toContain('truncate');

    fireEvent.click(screen.getByTitle('Expand all'));
    expect(cellFor(rows[0]!.name).className).toContain('whitespace-normal');
    expect(cellFor(rows[1]!.name).className).toContain('whitespace-normal');

    fireEvent.click(screen.getByTitle('Collapse all'));
    expect(cellFor(rows[0]!.name).className).toContain('truncate');
    expect(cellFor(rows[1]!.name).className).toContain('truncate');
  });
});
