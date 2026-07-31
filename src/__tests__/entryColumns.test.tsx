/** @jest-environment jsdom */
import { injectColumns, renderEntry, trackRows, isConstrainedConnection } from '../content/debugLogs';

/**
 * The Setup ▸ Debug Logs list is a plain Classic table (Lightning renders the
 * same page in an iframe). These tests stand in for the page structure so the
 * DOM work is covered without a live org — the part a real org still has to
 * confirm is the actual markup, not this logic.
 */
function buildLogTable(logIds: string[]): HTMLTableElement {
  const table = document.createElement('table');
  const head = table.createTHead();
  const headerRow = head.insertRow();
  for (const label of ['Time', 'User', 'Operation', 'Status', 'Size']) {
    const th = document.createElement('th');
    th.textContent = label;
    headerRow.appendChild(th);
  }
  const body = table.createTBody();
  for (const id of logIds) {
    const row = body.insertRow();
    const link = document.createElement('a');
    link.setAttribute('href', `/servlet/debug/apex/ApexCodeTruncated?log_id=${id}`);
    link.textContent = 'View';
    row.insertCell().appendChild(link);
    for (let i = 0; i < 4; i++) row.insertCell().textContent = '-';
  }
  document.body.appendChild(table);
  return table;
}

describe('injectColumns', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('adds three headers and three cells per log row', () => {
    buildLogTable(['07Lg500000AHo13EAD', '07Lg500000AHo14EAD']);
    const pending = injectColumns();

    const headers = document.querySelectorAll('th.sfda-entry-cell');
    expect(Array.from(headers).map((h) => h.textContent)).toEqual(['Type', 'Class', 'Method']);
    expect(pending).toHaveLength(2);
    for (const row of pending) {
      expect(row.querySelectorAll('td.sfda-entry-cell')).toHaveLength(3);
    }
  });

  it('records the log id on the row so the lookup can be keyed by it', () => {
    buildLogTable(['07Lg500000AHo13EAD']);
    const [row] = injectColumns();
    expect(row!.getAttribute('data-sfda-log-id')).toBe('07Lg500000AHo13EAD');
  });

  it('is idempotent — the Setup table re-renders on every sort and refresh', () => {
    buildLogTable(['07Lg500000AHo13EAD']);
    injectColumns();
    const second = injectColumns();

    expect(second).toHaveLength(0); // nothing new to resolve
    expect(document.querySelectorAll('th.sfda-entry-cell')).toHaveLength(3);
    expect(document.querySelectorAll('td.sfda-entry-cell')).toHaveLength(3);
  });

  it('picks up rows added after the first pass without redoing existing ones', () => {
    const table = buildLogTable(['07Lg500000AHo13EAD']);
    injectColumns();

    const row = table.tBodies[0]!.insertRow();
    const link = document.createElement('a');
    link.setAttribute('href', '/servlet/debug?log_id=07Lg500000AHo99EAD');
    row.insertCell().appendChild(link);

    const pending = injectColumns();
    expect(pending).toHaveLength(1);
    expect(pending[0]!.getAttribute('data-sfda-log-id')).toBe('07Lg500000AHo99EAD');
    expect(document.querySelectorAll('th.sfda-entry-cell')).toHaveLength(3);
  });

  it('ignores tables that hold no log links', () => {
    const other = document.createElement('table');
    const row = other.insertRow();
    row.insertCell().textContent = 'unrelated';
    document.body.appendChild(other);

    expect(injectColumns()).toHaveLength(0);
    expect(document.querySelectorAll('.sfda-entry-cell')).toHaveLength(0);
  });

  it('does not touch rows without a log id', () => {
    const table = buildLogTable(['07Lg500000AHo13EAD']);
    const footer = table.tBodies[0]!.insertRow();
    footer.insertCell().textContent = 'No more records';

    injectColumns();
    expect(footer.querySelectorAll('.sfda-entry-cell')).toHaveLength(0);
  });

  /**
   * Classic Setup pages are table-based layouts with several `<table>`
   * elements on one page. A decoy needing only one coincidental match to win
   * (the earlier "first table, first 8 rows" heuristic) is exactly what
   * attached columns to a small disconnected element instead of the real list
   * of dozens of rows on a live org.
   */
  it('picks the table with the most matching rows over an earlier decoy with fewer', () => {
    const decoy = document.createElement('table');
    const decoyRow = decoy.insertRow();
    const decoyLink = document.createElement('a');
    decoyLink.setAttribute('href', '/servlet/debug?log_id=07Lg500000AHoDECOY');
    decoyRow.insertCell().appendChild(decoyLink);
    document.body.insertBefore(decoy, document.body.firstChild); // earlier in DOM order

    const real = buildLogTable(
      Array.from({ length: 20 }, (_, i) => `07Lg500000AHo${String(i).padStart(2, '0')}EAD`),
    );

    const pending = injectColumns();
    expect(pending).toHaveLength(20);
    expect(decoy.querySelectorAll('.sfda-entry-cell')).toHaveLength(0);
    expect(real.querySelectorAll('td.sfda-entry-cell').length).toBeGreaterThan(0);
  });

  /**
   * Reported from a real org with exactly one debug log in the list: Classic
   * Setup wraps the whole page in an outer layout table, one of whose rows has
   * a single `<td>` containing the *entire* real Debug Logs section — the real
   * list table nested inside it. A plain subtree search finds the one real
   * log's link buried inside that wrapper row and counts it as if the wrapper
   * row were itself a log row. With only one real log, the outer table then
   * ties the inner table's own single genuine match, and picking whichever
   * table was seen first favoured the outer (earlier in document order)
   * wrapper — attaching columns and cells to the wrong, outer table entirely.
   */
  it('does not let an outer wrapper table win by counting a log row nested inside it', () => {
    const outer = document.createElement('table');
    const wrapperRow = outer.insertRow();
    const wrapperCell = wrapperRow.insertCell();
    document.body.appendChild(outer);

    // The one real log's table lives nested inside the outer wrapper row's cell.
    const real = buildLogTable(['07Lg500000AHo13EAD']);
    wrapperCell.appendChild(real);

    const pending = injectColumns();
    expect(pending).toHaveLength(1);
    expect(pending[0]!.closest('table')).toBe(real);
    // The outer wrapper row must not have been treated as a log row itself.
    expect(wrapperRow.hasAttribute('data-sfda-log-id')).toBe(false);
    expect(outer.querySelectorAll(':scope > tbody > tr > th.sfda-entry-cell')).toHaveLength(0);
  });
});

describe('renderEntry', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('fills the three cells from a resolved entry point', () => {
    buildLogTable(['07Lg500000AHo13EAD']);
    const [row] = injectColumns();
    renderEntry(row!, { type: 'Trigger', className: 'AccountTrigger', methodName: 'BeforeUpdate on Account' });

    const cells = row!.querySelectorAll('td.sfda-entry-cell');
    expect(Array.from(cells).map((c) => c.textContent)).toEqual([
      'Trigger',
      'AccountTrigger',
      'BeforeUpdate on Account',
    ]);
  });

  it('shows a dash when the log genuinely has no code unit', () => {
    buildLogTable(['07Lg500000AHo13EAD']);
    const [row] = injectColumns();
    renderEntry(row!, null);

    const cells = row!.querySelectorAll('td.sfda-entry-cell');
    expect(cells[0]!.textContent).toBe('—');
    expect(cells[1]!.textContent).toBe('');
  });

  it('explains itself in a tooltip when the lookup failed', () => {
    buildLogTable(['07Lg500000AHo13EAD']);
    const [row] = injectColumns();
    renderEntry(row!, null, true);

    const cells = row!.querySelectorAll('td.sfda-entry-cell');
    expect(cells[0]!.textContent).toBe('—');
    expect(cells[0]!.title).toMatch(/Could not read this log/);
  });

  it('leaves a row alone if its cells are missing', () => {
    const orphan = document.createElement('tr');
    expect(() => renderEntry(orphan, { type: 'Apex', className: 'A', methodName: 'b' })).not.toThrow();
  });
});

/**
 * The whole point of the connection check: on a metered or slow link, a column
 * must not quietly cost the user a request per row.
 */
describe('isConstrainedConnection', () => {
  it('treats Data Saver as constrained regardless of speed', () => {
    expect(isConstrainedConnection({ saveData: true, effectiveType: '4g' })).toBe(true);
  });

  it('treats 2G and 3G as constrained', () => {
    expect(isConstrainedConnection({ effectiveType: 'slow-2g' })).toBe(true);
    expect(isConstrainedConnection({ effectiveType: '2g' })).toBe(true);
    expect(isConstrainedConnection({ effectiveType: '3g' })).toBe(true);
  });

  it('allows 4g', () => {
    expect(isConstrainedConnection({ effectiveType: '4g', saveData: false })).toBe(false);
  });

  it('does not assume the worst when the browser reports nothing', () => {
    // Firefox and Safari do not implement NetworkInformation. Treating "unknown"
    // as "slow" would disable the feature for those users permanently.
    expect(isConstrainedConnection(undefined)).toBe(false);
    expect(isConstrainedConnection({})).toBe(false);
  });
});

describe('trackRows gating', () => {
  const AUTO = { autoResolve: true, respectSaveData: true };
  const resolveButton = (row: HTMLTableRowElement) =>
    row.querySelector<HTMLButtonElement>('td.sfda-entry-cell button');

  beforeEach(() => {
    document.body.innerHTML = '';
    // jsdom has no IntersectionObserver; trackRows falls back to eager enqueue,
    // which only queues — no message is sent until the debounce fires.
    (globalThis as unknown as { chrome: unknown }).chrome = {
      runtime: { sendMessage: jest.fn(), lastError: undefined },
    };
  });

  it('offers a Resolve button instead of fetching when auto-resolve is off', () => {
    buildLogTable(['07Lg500000AHo13EAD']);
    const rows = injectColumns();
    trackRows(rows, { autoResolve: false, respectSaveData: true });

    expect(resolveButton(rows[0]!)).not.toBeNull();
    expect(resolveButton(rows[0]!)!.textContent).toBe('Resolve');
  });

  it('does not show a Resolve button when auto-resolve is on', () => {
    buildLogTable(['07Lg500000AHo13EAD']);
    const rows = injectColumns();
    trackRows(rows, AUTO);

    expect(resolveButton(rows[0]!)).toBeNull();
  });

  it('clicking Resolve swaps the button for a pending placeholder', () => {
    buildLogTable(['07Lg500000AHo13EAD']);
    const rows = injectColumns();
    trackRows(rows, { autoResolve: false, respectSaveData: true });

    resolveButton(rows[0]!)!.click();
    const first = rows[0]!.querySelector('td.sfda-entry-cell')!;
    expect(first.querySelector('button')).toBeNull();
    expect(first.textContent).toBe('…');
  });

  it('does not stack buttons when the table re-renders', () => {
    buildLogTable(['07Lg500000AHo13EAD']);
    const rows = injectColumns();
    trackRows(rows, { autoResolve: false, respectSaveData: true });
    trackRows(rows, { autoResolve: false, respectSaveData: true });

    expect(rows[0]!.querySelectorAll('td.sfda-entry-cell button')).toHaveLength(1);
  });
});
