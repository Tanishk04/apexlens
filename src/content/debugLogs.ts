/**
 * Content script for the Salesforce Setup ▸ Debug Logs screen — and nowhere
 * else. Two additions to that page:
 *
 *  - an "Analyze" button per row, which opens the log in ApexLens
 *  - Type / Class / Method columns naming the code that produced each log
 *
 * The list itself only shows Operation/Status/Size, so working out which class
 * or trigger a log belongs to otherwise means opening logs one at a time. The
 * answer is in each log's first CODE_UNIT_STARTED line; the background worker
 * reads just far enough into the body to find it (see fetchLogEntryPoint) and
 * caches the result.
 *
 * Rows are resolved only once they scroll into view, so a long list does not
 * trigger a fetch per row on load.
 *
 * The Lightning setup page embeds the classic list at
 * /setup/ui/listApexTraces.apexp inside an iframe, so this runs with
 * all_frames: true and activates only when the frame URL matches.
 */

import type { EntryPoint } from '../entryPoint';
import { LAST_SEEN_VERSION_KEY, readSettings, readSuspendState } from '../settings';

const APEX_LOG_ID = /\b(07L[0-9A-Za-z]{12}(?:[0-9A-Za-z]{3})?)\b/;

/** Extract an ApexLog id from a row link's href/onclick, if present. */
export function extractLogId(value: string | null | undefined): string | null {
  if (!value) return null;
  const m = value.match(APEX_LOG_ID);
  return m ? m[1]! : null;
}

function isDebugLogsPage(): boolean {
  const path = location.pathname;
  return (
    path.includes('/setup/ui/listApexTraces.apexp') ||
    path.includes('ApexDebugLogDetail') ||
    path.includes('/lightning/setup/ApexDebugLogs')
  );
}

/**
 * Could this frame ever *become* the Debug Logs page without a reload? Lightning
 * Setup is a SPA, so we must keep watching there — but only there. Ordinary
 * record/home pages can never navigate into Setup in-place, and attaching a
 * subtree observer to every frame of every Salesforce page would tax the user's
 * tab for nothing.
 */
function isSetupContext(): boolean {
  const path = location.pathname;
  return path.includes('/lightning/setup') || path.includes('/setup/') || isDebugLogsPage();
}

const BTN_CLASS = 'sfda-analyze-btn';

function makeButton(logId: string): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = BTN_CLASS;
  btn.type = 'button';
  btn.textContent = 'Analyze';
  btn.style.cssText = [
    'margin-left:6px',
    'padding:1px 8px',
    'font-size:11px',
    'font-weight:600',
    'color:#fff',
    'background:#0176d3',
    'border:none',
    'border-radius:4px',
    'cursor:pointer',
    'vertical-align:middle',
  ].join(';');
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    chrome.runtime.sendMessage({ action: 'openAppTab', logId, domain: location.origin });
  });
  return btn;
}

function injectButtons(): void {
  // Classic list rows link to the log via href/onclick containing the 07L id.
  const links = document.querySelectorAll<HTMLAnchorElement>('a[href], a[onclick]');
  for (const link of links) {
    const logId =
      extractLogId(link.getAttribute('href')) ?? extractLogId(link.getAttribute('onclick'));
    if (!logId) continue;
    const cell = link.parentElement;
    if (!cell || cell.querySelector(`.${BTN_CLASS}`)) continue;
    cell.appendChild(makeButton(logId));
  }
}

/**
 * True if a batch of mutations contains nothing but elements we injected
 * ourselves. We append to the very tree we observe, so without this the
 * observer re-triggers itself on every insertion.
 */
export function isSelfMutation(records: MutationRecord[]): boolean {
  return records.every((record) =>
    Array.from(record.addedNodes).every(
      (node) =>
        node instanceof HTMLElement &&
        (node.classList.contains(BTN_CLASS) ||
          node.classList.contains(CELL_CLASS) ||
          node.classList.contains(INFO_CLASS) ||
          node.classList.contains(BANNER_CLASS) ||
          node.classList.contains(MANUAL_REFRESH_CLASS)),
    ),
  );
}

// ---------------------------------------------------------------------------
// Type / Class / Method columns
// ---------------------------------------------------------------------------

const CELL_CLASS = 'sfda-entry-cell';
const LOG_ID_ATTR = 'data-sfda-log-id';
const COLUMNS = ['Type', 'Class', 'Method'] as const;

/**
 * Find the row's log id. The Analyze button already resolves one per row from a
 * link's href/onclick; reuse the same scan rather than a second convention.
 *
 * `owner`, when given, rejects a match whose link actually belongs to a table
 * nested *inside* `row` rather than `row` itself. Classic Setup wraps the
 * whole page in an outer layout table; one of its rows has a single `<td>`
 * containing the *entire* real Debug Logs section, real table and all. A
 * plain subtree search (`row.querySelectorAll`) finds the real log's link
 * buried inside that wrapper row and reports it as if the wrapper row were
 * itself a log row — with only one log in the list, that wrapper then ties
 * the real table's own single genuine match, and `findLogTable` picks the
 * wrapper because it's earlier in document order. Checking that the link's
 * nearest table ancestor really is `owner` (not some table nested even
 * deeper inside it) rejects that false match at the source.
 */
function rowLogId(row: HTMLTableRowElement, owner?: HTMLTableElement): string | null {
  for (const link of row.querySelectorAll('a[href], a[onclick]')) {
    if (owner && link.closest('table') !== owner) continue;
    const id =
      extractLogId(link.getAttribute('href')) ?? extractLogId(link.getAttribute('onclick'));
    if (id) return id;
  }
  return null;
}

/**
 * The list table, identified by actually containing log-id links.
 *
 * Classic Salesforce Setup pages are old-style, table-based layouts with
 * several `<table>` elements on one page. Returning the FIRST table with even
 * one matching row (scanning only its first 8) meant a decoy — a "recently
 * viewed" widget, a hover/quick-view panel — needed only one coincidental
 * match to win over the real list, which could have dozens. That's what
 * produced columns attached to a small, disconnected element while the actual
 * table of rows stayed untouched.
 *
 * Scanning every row of every table and keeping the one with the MOST matches
 * fixes that: a decoy has at most one or two hits, the real list has many.
 * `table.rows` only ever contains that table's own direct rows (not a nested
 * table's), so this can't double-count. Debug Logs pages run to at most a few
 * hundred rows, so scanning all of them, in the already rAF-coalesced
 * injection pass rather than per mutation, costs nothing noticeable.
 */
function findLogTable(): HTMLTableElement | null {
  let best: HTMLTableElement | null = null;
  let bestCount = 0;
  for (const table of document.querySelectorAll('table')) {
    let count = 0;
    for (const row of Array.from(table.rows)) {
      if (rowLogId(row, table)) count++;
    }
    if (count > bestCount) {
      bestCount = count;
      best = table;
    }
  }
  return best;
}

function makeCell(row: HTMLTableRowElement): HTMLTableCellElement {
  const cell = document.createElement('td');
  cell.className = CELL_CLASS;
  cell.textContent = '…';
  cell.style.cssText = 'color:#706e6b;font-size:11px;white-space:nowrap';
  row.appendChild(cell);
  return cell;
}

/**
 * Add the three headers and three empty cells per row. Idempotent — the Setup
 * table re-renders on sort and refresh, and this runs again each time.
 */
export function injectColumns(): HTMLTableRowElement[] {
  const table = findLogTable();
  if (!table) return [];

  const header = table.tHead?.rows[0] ?? table.rows[0];
  if (header && !header.querySelector(`.${CELL_CLASS}`)) {
    for (const label of COLUMNS) {
      const th = document.createElement('th');
      th.className = CELL_CLASS;
      th.textContent = label;
      th.style.cssText = 'white-space:nowrap';
      header.appendChild(th);
    }
  }

  const pending: HTMLTableRowElement[] = [];
  for (const row of Array.from(table.rows)) {
    if (row === header) continue;
    const logId = rowLogId(row, table);
    if (!logId) continue;
    if (row.querySelector(`.${CELL_CLASS}`)) continue;
    row.setAttribute(LOG_ID_ATTR, logId);
    for (let i = 0; i < COLUMNS.length; i++) makeCell(row);
    pending.push(row);
  }
  return pending;
}

export function renderEntry(row: HTMLTableRowElement, entry: EntryPoint | null, failed = false): void {
  const cells = row.querySelectorAll<HTMLTableCellElement>(`td.${CELL_CLASS}`);
  if (cells.length < COLUMNS.length) return;
  const values = entry
    ? [entry.type, entry.className, entry.methodName]
    : ['—', failed ? '—' : '', ''];
  cells.forEach((cell, i) => {
    cell.textContent = values[i] ?? '';
    cell.title = values[i] ?? '';
  });
  if (failed) {
    cells[0]!.title = 'Could not read this log — it may have been deleted or the session expired.';
  }
}

// ---------------------------------------------------------------------------
// Connection awareness
// ---------------------------------------------------------------------------

interface NetworkInformation {
  saveData?: boolean;
  effectiveType?: string;
}

/** Effective types where an automatic per-row request is not a fair thing to do. */
const SLOW_TYPES = new Set(['slow-2g', '2g', '3g']);

/**
 * Should we hold off fetching automatically on this connection?
 *
 * Read here rather than in the background worker: `navigator.connection` is a
 * page API and is reliably populated in the content script, where the user's
 * actual browsing context lives.
 */
export function isConstrainedConnection(info?: NetworkInformation): boolean {
  const conn = info ?? (navigator as { connection?: NetworkInformation }).connection;
  if (!conn) return false; // Unknown — do not assume the worst.
  if (conn.saveData === true) return true;
  return conn.effectiveType !== undefined && SLOW_TYPES.has(conn.effectiveType);
}

/** Fewer parallel requests when the link is usable but not fast. */
function concurrencyForConnection(): number {
  const conn = (navigator as { connection?: NetworkInformation }).connection;
  return conn?.effectiveType === '4g' || conn?.effectiveType === undefined ? 4 : 2;
}

// ---------------------------------------------------------------------------
// Lookup queue
// ---------------------------------------------------------------------------

/** Rows awaiting a lookup, so a single message can cover everything on screen. */
const queued = new Map<string, HTMLTableRowElement>();
let flushHandle = 0;

function flushQueue(): void {
  flushHandle = 0;
  if (queued.size === 0) return;
  const batch = new Map(queued);
  queued.clear();

  chrome.runtime.sendMessage(
    {
      action: 'getEntryPoints',
      logIds: [...batch.keys()],
      domain: location.origin,
      concurrency: concurrencyForConnection(),
    },
    (
      response:
        | {
            ok: boolean;
            entries?: Record<string, EntryPoint | null>;
            suspend?: { suspended: boolean; averageBytes: number };
          }
        | undefined,
    ) => {
      // An invalidated context (extension reloaded) surfaces here as lastError.
      if (chrome.runtime.lastError || !response?.ok) {
        for (const row of batch.values()) renderEntry(row, null, true);
        return;
      }
      if (response.suspend?.suspended) {
        // The background measured that reads are not being bounded on this org
        // and stood down. Stop asking, and switch the remaining rows to manual
        // so the user can still resolve one deliberately.
        suspended = response.suspend;
        for (const [logId, row] of batch) {
          if (response.entries?.[logId] !== undefined) renderEntry(row, response.entries[logId]!);
          else renderResolveButton(row);
        }
        return;
      }
      for (const [logId, row] of batch) {
        renderEntry(row, response.entries?.[logId] ?? null);
      }
    },
  );
}

function enqueue(row: HTMLTableRowElement): void {
  const logId = row.getAttribute(LOG_ID_ATTR);
  if (!logId || queued.has(logId)) return;
  queued.set(logId, row);
  // Coalesce the burst the IntersectionObserver emits on first paint into one
  // message, so a screenful of rows costs one round trip rather than twenty.
  if (!flushHandle) flushHandle = setTimeout(flushQueue, 50) as unknown as number;
}

/**
 * Replace a row's placeholder with a button, so nothing is fetched until the
 * user asks. Used when auto-resolve is off, the connection is constrained, or
 * the byte budget tripped.
 */
function renderResolveButton(row: HTMLTableRowElement): void {
  const cells = row.querySelectorAll<HTMLTableCellElement>(`td.${CELL_CLASS}`);
  if (cells.length < COLUMNS.length) return;
  const first = cells[0]!;
  if (first.querySelector('button')) return;
  first.textContent = '';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = 'Resolve';
  btn.style.cssText =
    'padding:1px 6px;font-size:11px;color:#0176d3;background:none;border:1px solid #c9c7c5;border-radius:3px;cursor:pointer';
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    first.textContent = '…';
    enqueue(row);
  });
  first.appendChild(btn);
  for (let i = 1; i < cells.length; i++) cells[i]!.textContent = '';
}

/**
 * Resolve a row only once it is actually on screen. The Debug Logs list can run
 * to hundreds of rows and each lookup is a request against the user's org.
 */
const visibility =
  typeof IntersectionObserver === 'undefined'
    ? null
    : new IntersectionObserver(
        (entries, observer) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            observer.unobserve(entry.target);
            enqueue(entry.target as HTMLTableRowElement);
          }
        },
        { rootMargin: '200px' },
      );

/**
 * Decide, per batch of new rows, whether to fetch or offer a button. Settings
 * win over the connection heuristic: a user who turned `respectSaveData` off
 * has said they would rather have the data.
 */
export function trackRows(
  rows: HTMLTableRowElement[],
  settings: { autoResolve: boolean; respectSaveData: boolean },
): void {
  const manual =
    !settings.autoResolve ||
    suspended?.suspended === true ||
    (settings.respectSaveData && isConstrainedConnection());

  for (const row of rows) {
    if (manual) {
      renderResolveButton(row);
      continue;
    }
    if (visibility) visibility.observe(row);
    else enqueue(row); // No IntersectionObserver: resolve eagerly.
  }
}

// ---------------------------------------------------------------------------
// ⓘ chip — what this is, what's new, and how to turn it off
// ---------------------------------------------------------------------------

const INFO_CLASS = 'sfda-info-chip';

/** One line per release, shown in the chip so users learn what changed in place. */
const WHATS_NEW =
  'New: Type / Class / Method columns on this page, so you can see which Apex class, trigger ' +
  'or flow produced each log without opening it.';

export function buildInfoPopover(shadow: ShadowRoot, version: string, unread: boolean): void {
  // Everything lives behind a shadow root: this markup sits inside Salesforce's
  // page, where SLDS would restyle it and our own styles would leak back out.
  // A shadow boundary makes both impossible without a single !important.
  const style = document.createElement('style');
  style.textContent = `
    :host { all: initial; display: inline-block; }
    .chip {
      display:inline-flex; align-items:center; gap:4px; margin-left:8px; padding:1px 7px;
      font:600 11px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
      color:#0176d3; background:#fff; border:1px solid #c9c7c5; border-radius:10px;
      cursor:pointer; vertical-align:middle;
    }
    .chip:hover { background:#f3f3f3; }
    .dot {
      position:absolute; top:-2px; right:-2px; width:6px; height:6px;
      background:#ea001e; border-radius:50%;
    }
    .panel {
      /*
        position:fixed, placed in JS from the chip's own getBoundingClientRect
        (see the click handler below), not CSS anchoring. This chip lives
        inside Salesforce's own (often very wide, independently
        horizontally-scrolled) Setup table; anchoring with position:absolute
        and right:0 made the panel's placement — and whether it silently grew
        the page's own scrollable width — depend on ancestor layout we don't
        control (table-layout quirks, an ancestor's own scroll container,
        etc.). Fixed positioning is relative to the viewport only, so it can
        never inflate any ancestor's scrollWidth, and the coordinates are
        clamped on open so the panel is always fully on-screen regardless of
        where the chip sits in a wide, scrolled table.
      */
      /*
        max-height + overflow-y:auto, set alongside top/left in positionPanel:
        the fixed-position clamping above only kept the panel's top-left corner
        on-screen, not its bottom edge. With no height bound, a short browser
        window let the panel's own content — including the Settings button —
        render past the bottom of the viewport. A page scroll can't reach it
        (fixed elements don't move with the page) and there was no internal
        scroll either, so it was flatly unreachable; zooming out was the only
        way to shrink it back into view. An internal scrollbar fixes that
        regardless of window size, rather than relying on the content always
        happening to be short enough.
      */
      position:fixed; z-index:9999; overflow-y:auto;
      width:290px; max-width:90vw; box-sizing:border-box; padding:12px;
      font:400 12px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
      color:#181818; background:#fff; border:1px solid #c9c7c5; border-radius:6px;
      box-shadow:0 2px 8px rgba(0,0,0,.16);
    }
    .panel h4 { margin:0 0 6px; font-size:12px; font-weight:700; }
    .panel p { margin:0 0 8px; }
    .muted { color:#706e6b; }
    .row { display:flex; gap:8px; margin-top:10px; }
    .btn {
      flex:1; padding:5px 8px; font:600 11px/1.4 inherit; color:#0176d3; background:#fff;
      border:1px solid #c9c7c5; border-radius:4px; cursor:pointer;
    }
    .btn:hover { background:#f3f3f3; }
    [hidden] { display:none; }
  `;

  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'chip';
  // An inline SVG rather than the `ⓘ` character (U+24D8). As text it depends
  // on whatever font the page resolves it from — a glyph most UI fonts don't
  // carry, so it falls back to one that does, at a size and weight matching
  // nothing around it. At the chip's 11px that landed visibly lopsided, and
  // looked fine only when zoomed in, i.e. when given enough device pixels to
  // hide the mismatch. A vector drawn to the same stroke weight as the border
  // is resolution-independent and can't be substituted.
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('width', '12');
  icon.setAttribute('height', '12');
  icon.setAttribute('fill', 'none');
  icon.setAttribute('stroke', 'currentColor');
  icon.setAttribute('stroke-width', '2');
  icon.setAttribute('stroke-linecap', 'round');
  icon.setAttribute('aria-hidden', 'true');
  const ring = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  ring.setAttribute('cx', '12');
  ring.setAttribute('cy', '12');
  ring.setAttribute('r', '10');
  const stem = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  stem.setAttribute('x1', '12');
  stem.setAttribute('y1', '11');
  stem.setAttribute('x2', '12');
  stem.setAttribute('y2', '16');
  const dotI = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  dotI.setAttribute('x1', '12');
  dotI.setAttribute('y1', '7.5');
  dotI.setAttribute('x2', '12');
  dotI.setAttribute('y2', '7.5');
  icon.append(ring, stem, dotI);

  const label = document.createElement('span');
  label.textContent = 'ApexLens';
  chip.append(icon, label);
  if (unread) {
    const dot = document.createElement('span');
    dot.className = 'dot';
    chip.appendChild(dot);
  }

  const panel = document.createElement('div');
  panel.className = 'panel';
  panel.hidden = true;

  const heading = document.createElement('h4');
  heading.textContent = `ApexLens ${version}`;
  const whatsNew = document.createElement('p');
  whatsNew.textContent = WHATS_NEW;
  const source = document.createElement('p');
  source.className = 'muted';
  source.textContent =
    'Each row is identified by reading only the first few KB of its log — never the whole thing.';

  const notice = document.createElement('p');
  notice.className = 'muted';
  notice.hidden = true;

  const row = document.createElement('div');
  row.className = 'row';
  const settingsBtn = document.createElement('button');
  settingsBtn.type = 'button';
  settingsBtn.className = 'btn';
  settingsBtn.textContent = 'Settings';
  settingsBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'openOptions' });
  });
  row.appendChild(settingsBtn);

  panel.append(heading, whatsNew, source, notice, row);

  /**
   * Clamp the fixed-position panel to the chip, fully inside the viewport —
   * on all four edges, not just top-left. Bounding `max-height` to the actual
   * space below `top` is what makes the bottom edge honour the same
   * constraint the left/right edges already did; `overflow-y:auto` (in the
   * stylesheet above) is what makes content that still doesn't fit reachable
   * by scrolling the panel itself, rather than by shrinking the browser zoom.
   */
  const positionPanel = () => {
    const rect = chip.getBoundingClientRect();
    const margin = 8;
    const width = 290;
    // Open leftward from the chip's right edge by default (chip usually sits
    // at the right of the table), but never past the viewport's own edges.
    const left = Math.min(Math.max(rect.right - width, margin), window.innerWidth - width - margin);
    const top = Math.min(rect.bottom + 6, window.innerHeight - margin);
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
    panel.style.maxHeight = `${Math.max(80, window.innerHeight - top - margin)}px`;
  };

  chip.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    panel.hidden = !panel.hidden;
    if (!panel.hidden) {
      positionPanel();
      if (suspended?.suspended) {
        notice.hidden = false;
        notice.textContent =
          `Lookups are paused: this org averaged ${Math.round(suspended.averageBytes / 1024)} KB ` +
          'per log, so the request could not be cut short. Re-enable in Settings.';
      }
      // Opening it counts as reading the note.
      chip.querySelector('.dot')?.remove();
      void chrome.storage?.local?.set({ [LAST_SEEN_VERSION_KEY]: version });
    }
  });

  document.addEventListener('click', () => {
    panel.hidden = true;
  });
  // position:fixed doesn't scroll with the page — closing on scroll avoids a
  // panel that visually detaches from the chip that opened it.
  window.addEventListener('scroll', () => {
    panel.hidden = true;
  }, { capture: true, passive: true });

  shadow.append(style, chip, panel);
}

function injectInfoChip(header: HTMLTableRowElement, lastSeenVersion: string): void {
  if (header.querySelector(`.${INFO_CLASS}`)) return;
  const version = chrome.runtime?.getManifest?.().version ?? '';
  const host = document.createElement('span');
  host.className = INFO_CLASS;
  buildInfoPopover(host.attachShadow({ mode: 'open' }), version, lastSeenVersion !== version);
  // Sits in the last header cell we added, so it travels with our columns.
  header.querySelector(`th.${CELL_CLASS}:last-of-type`)?.appendChild(host);
}

// ---------------------------------------------------------------------------
// New-log polling
// ---------------------------------------------------------------------------
//
// Classic's Debug Logs list is rendered once, server-side, with nothing on
// the page watching for new rows — a log that finishes generating after the
// page loaded is invisible until the user thinks to reload. Polling the
// background for the newest ApexLog ids and comparing against what's
// actually rendered lets us tell them a new one exists, without guessing at
// how to fabricate a correct row ourselves (see findLogTable's own history
// of getting Classic's real markup wrong).

const NEW_LOG_POLL_MS = 20_000;
const NEW_LOG_POLL_LIMIT = 10;
const BANNER_CLASS = 'sfda-new-logs-banner';

/** Every ApexLog id currently visible anywhere on the page — same scan `injectButtons` uses. */
function renderedLogIds(): Set<string> {
  const ids = new Set<string>();
  for (const link of document.querySelectorAll<HTMLAnchorElement>('a[href], a[onclick]')) {
    const id = extractLogId(link.getAttribute('href')) ?? extractLogId(link.getAttribute('onclick'));
    if (id) ids.add(id);
  }
  return ids;
}

/**
 * Which of `fetchedIds` (newest-first from the org) are genuinely new: not
 * already on the page, and not already dismissed by the user this session.
 * Pure and exported so the decision is testable without a live Setup page.
 */
export function findNewLogIds(
  renderedIds: Set<string>,
  fetchedIds: string[],
  dismissedIds: Set<string>,
): string[] {
  return fetchedIds.filter((id) => !renderedIds.has(id) && !dismissedIds.has(id));
}

export function buildNewLogsBanner(onRefresh: () => void, onDismiss: () => void): { host: HTMLElement; setCount: (n: number) => void } {
  const host = document.createElement('div');
  host.className = BANNER_CLASS;
  const shadow = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = `
    :host { all: initial; }
    /*
      Reported live: the banner stayed visible reading "0 new logs" even
      though setCount(0) correctly set host.hidden = true. \`all: initial\`
      resets every inherited/default property on the host — including
      \`display\`, whose UA-stylesheet [hidden] { display: none } rule lives
      OUTSIDE this shadow tree and gets reset right along with everything
      else. The hidden attribute was still there; the CSS that's supposed to
      act on it wasn't taking effect anymore. Restated explicitly, inside the
      same tree that reset it, so it actually applies.
    */
    :host([hidden]) { display: none; }
    .bar {
      position: fixed; top: 0; left: 50%; transform: translateX(-50%);
      z-index: 9999; margin-top: 10px;
      display: flex; align-items: center; gap: 10px;
      padding: 8px 14px; border-radius: 8px;
      background: #062e6f; border: 1px solid #0176d3; color: #fff;
      font: 500 13px/1.4 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      box-shadow: 0 4px 16px rgba(0,0,0,.25);
    }
    button { font: inherit; cursor: pointer; border-radius: 4px; }
    .refresh {
      padding: 4px 10px; color: #062e6f; background: #fff; border: none; font-weight: 600;
    }
    .refresh:hover { background: #e5f1fe; }
    .dismiss {
      padding: 2px 6px; color: #cfe4ff; background: transparent; border: none; font-size: 15px; line-height: 1;
    }
    .dismiss:hover { color: #fff; }
  `;

  const bar = document.createElement('div');
  bar.className = 'bar';
  const label = document.createElement('span');
  const refreshBtn = document.createElement('button');
  refreshBtn.type = 'button';
  refreshBtn.className = 'refresh';
  refreshBtn.textContent = 'Refresh';
  refreshBtn.addEventListener('click', onRefresh);
  const dismissBtn = document.createElement('button');
  dismissBtn.type = 'button';
  dismissBtn.className = 'dismiss';
  dismissBtn.textContent = '×';
  dismissBtn.setAttribute('aria-label', 'Dismiss');
  dismissBtn.addEventListener('click', () => {
    host.hidden = true;
    onDismiss();
  });
  bar.append(label, refreshBtn, dismissBtn);
  shadow.append(style, bar);

  const setCount = (n: number) => {
    label.textContent = `${n} new log${n === 1 ? '' : 's'} — refresh to see ${n === 1 ? 'it' : 'them'}`;
    host.hidden = n === 0;
  };
  return { host, setCount };
}

const MANUAL_REFRESH_CLASS = 'sfda-manual-refresh';

/**
 * A standalone refresh control, always present once polling is on — not tied
 * to a detected count. Requested directly: a way to re-check on demand rather
 * than waiting on the 20s poll or a banner appearing first. `onRefresh` reruns
 * the same scoped reload the banner's Refresh button uses (this frame only,
 * never the whole Setup shell — see startNewLogPolling's ensureBanner).
 */
export function buildManualRefreshButton(onRefresh: () => void): HTMLElement {
  const host = document.createElement('div');
  host.className = MANUAL_REFRESH_CLASS;
  const shadow = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = `
    :host { all: initial; }
    :host([hidden]) { display: none; }
    button {
      /* Classic already has its own circular refresh icon top-right (next to
         "Help for this Page") — bottom-right is clear of any native chrome. */
      position: fixed; bottom: 16px; right: 16px; z-index: 9999;
      display: flex; align-items: center; justify-content: center;
      width: 30px; height: 30px; border-radius: 50%;
      background: #062e6f; border: 1px solid #0176d3; color: #fff;
      cursor: pointer; font: 16px/1 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      box-shadow: 0 2px 8px rgba(0,0,0,.25);
    }
    button:hover { background: #0176d3; }
  `;

  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = '⟳';
  button.title = 'Refresh Debug Logs list';
  button.setAttribute('aria-label', 'Refresh Debug Logs list');
  button.addEventListener('click', onRefresh);
  shadow.append(style, button);

  return host;
}

function startNewLogPolling(): void {
  const dismissed = new Set<string>();
  // Populated on the first successful poll — nothing is "new" relative to a
  // baseline we haven't established yet, so the banner never fires on load.
  let baseline: Set<string> | null = null;
  let banner: { host: HTMLElement; setCount: (n: number) => void } | null = null;

  const ensureBanner = () => {
    if (banner) return banner;
    banner = buildNewLogsBanner(
      () => location.reload(),
      () => {
        for (const id of pendingIds) dismissed.add(id);
        pendingIds = [];
      },
    );
    document.body.appendChild(banner.host);
    return banner;
  };

  let pendingIds: string[] = [];

  const poll = () => {
    if (!isDebugLogsPage()) return; // SPA nav may have left the page without a reload.
    if (isConstrainedConnection()) return; // Try again next tick; connection may improve.

    chrome.runtime.sendMessage(
      { action: 'getRecentLogIds', domain: location.origin, limit: NEW_LOG_POLL_LIMIT },
      (response: { ok: boolean; ids?: string[] } | undefined) => {
        if (chrome.runtime.lastError || !response?.ok || !response.ids) return;
        if (!baseline) {
          baseline = new Set(response.ids);
          return;
        }
        pendingIds = findNewLogIds(renderedLogIds(), response.ids, dismissed);
        ensureBanner().setCount(pendingIds.length);
      },
    );
  };

  poll();
  setInterval(poll, NEW_LOG_POLL_MS);
}

/** Set when the background reports it stood down; drives the chip's notice. */
let suspended: { suspended: boolean; averageBytes: number } | null = null;

async function main(): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) return;
  if (!isSetupContext()) return;

  const settings = await readSettings();
  suspended = await readSuspendState();
  const stored = await chrome.storage.local.get(LAST_SEEN_VERSION_KEY);
  const lastSeenVersion = (stored[LAST_SEEN_VERSION_KEY] as string | undefined) ?? '';

  // Lightning embeds the Classic list in an iframe, and both frames' URLs
  // match isDebugLogsPage() — the outer frame is /lightning/setup/ApexDebugLogs/…
  // itself. Column/chip injection already silently no-ops there today because
  // findLogTable() finds no real table to attach to in that frame. Polling had
  // no equivalent check, so it started in *both* frames — two independent
  // pollers, two independent banners, stacked visibly on screen. Started only
  // once the real table is confirmed present in this frame, same gate the rest
  // of the feature already relies on.
  let pollingStarted = false;

  let scheduled = 0;
  const scheduleInject = () => {
    if (scheduled) return;
    scheduled = requestAnimationFrame(() => {
      scheduled = 0;
      // Re-checked per run, not once at load: Lightning is a SPA, so the user can
      // navigate into Setup ▸ Debug Logs without a page load. Testing only at
      // document_idle meant the button never appeared on that path.
      if (!isDebugLogsPage()) return;
      injectButtons();

      if (settings.notifyNewLogs && !pollingStarted && findLogTable()) {
        pollingStarted = true;
        startNewLogPolling();
        // Manual, on-demand alternative to waiting on the poll or a banner
        // appearing first — requested directly, since the reload it triggers
        // is already scoped to this frame, never the whole Setup shell.
        document.body.appendChild(buildManualRefreshButton(() => location.reload()));
      }

      // The columns are the only part that costs network, so the setting gates
      // them alone — the Analyze button stays regardless.
      if (!settings.entryColumns) return;
      const pending = injectColumns();
      const header = findLogTable()?.tHead?.rows[0];
      if (header) injectInfoChip(header, lastSeenVersion);
      trackRows(pending, settings);
    });
  };

  scheduleInject();

  // Classic tables re-render on sort/refresh, and Lightning mutates constantly.
  // Coalesce to one pass per frame — injectButtons scans the whole document, so
  // running it per mutation record was a real cost on the user's Salesforce tab.
  const observer = new MutationObserver((records) => {
    if (isSelfMutation(records)) return;
    scheduleInject();
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

main();
