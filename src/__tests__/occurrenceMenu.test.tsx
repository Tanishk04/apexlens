/** @jest-environment jsdom */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { SoqlAnalysis } from '../app/components/AnalysisView';
import type { Analysis } from '../app/utils/analysis';

/** react-virtual measurement — see virtualTable.test.tsx for why this is needed. */
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

function buildAnalysis(): Analysis {
  return {
    soql: [
      {
        query: 'SELECT Id FROM Account',
        count: 4,
        totalMs: 10,
        totalRows: 4,
        maxRows: 1,
        lineNumber: 10,
        inLoop: true,
        rawLines: [11, 22, 33, 44],
      },
      {
        query: 'SELECT Id FROM Contact',
        count: 1,
        totalMs: 2,
        totalRows: 1,
        maxRows: 1,
        lineNumber: 50,
        inLoop: false,
        rawLines: [51],
      },
    ],
    dml: [],
    flow: [],
    methods: [],
    soqlInLoopCount: 1,
  };
}

describe('SOQL Analysis — jump to a specific occurrence of a looped query', () => {
  it('a single-occurrence row jumps directly, no menu', () => {
    const onJumpToLine = jest.fn();
    render(<SoqlAnalysis analysis={buildAnalysis()} onJumpToLine={onJumpToLine} />);

    const btn = screen.getByTitle('Open line 51 in Log Explorer');
    fireEvent.click(btn);
    expect(onJumpToLine).toHaveBeenCalledWith(51);
  });

  it('a multi-occurrence row opens a menu listing every raw line, not just the first', () => {
    const onJumpToLine = jest.fn();
    render(<SoqlAnalysis analysis={buildAnalysis()} onJumpToLine={onJumpToLine} />);

    const btn = screen.getByTitle('4 occurrences — click to pick one');
    fireEvent.click(btn);

    expect(screen.getByText('#1 · line 11')).toBeTruthy();
    expect(screen.getByText('#2 · line 22')).toBeTruthy();
    expect(screen.getByText('#3 · line 33')).toBeTruthy();
    expect(screen.getByText('#4 · line 44')).toBeTruthy();
  });

  it('clicking a specific occurrence jumps to that exact line and closes the menu', () => {
    const onJumpToLine = jest.fn();
    render(<SoqlAnalysis analysis={buildAnalysis()} onJumpToLine={onJumpToLine} />);

    fireEvent.click(screen.getByTitle('4 occurrences — click to pick one'));
    fireEvent.click(screen.getByText('#3 · line 33'));

    expect(onJumpToLine).toHaveBeenCalledWith(33);
    expect(onJumpToLine).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('#1 · line 11')).toBeNull();
  });

  it('clicking outside the menu closes it without jumping', () => {
    const onJumpToLine = jest.fn();
    render(<SoqlAnalysis analysis={buildAnalysis()} onJumpToLine={onJumpToLine} />);

    fireEvent.click(screen.getByTitle('4 occurrences — click to pick one'));
    expect(screen.getByText('#1 · line 11')).toBeTruthy();

    fireEvent.click(document.body);
    expect(screen.queryByText('#1 · line 11')).toBeNull();
    expect(onJumpToLine).not.toHaveBeenCalled();
  });
});
