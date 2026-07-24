/**
 * Content script: injects an "Analyze" button next to each debug-log row on
 * the Salesforce Setup ▸ Debug Logs screen — and nowhere else. Replaces the
 * extension popup entirely (no UI is shown on any other Salesforce page).
 *
 * The Lightning setup page embeds the classic list at
 * /setup/ui/listApexTraces.apexp inside an iframe, so this runs with
 * all_frames: true and activates only when the frame URL matches.
 */

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
 * True if a batch of mutations contains nothing but our own injected buttons.
 * `injectButtons` appends to the very tree we observe, so without this the
 * observer re-triggers itself on every insertion.
 */
export function isSelfMutation(records: MutationRecord[]): boolean {
  return records.every((record) =>
    Array.from(record.addedNodes).every(
      (node) => node instanceof HTMLElement && node.classList.contains(BTN_CLASS),
    ),
  );
}

function main(): void {
  if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) return;
  if (!isSetupContext()) return;

  let scheduled = 0;
  const scheduleInject = () => {
    if (scheduled) return;
    scheduled = requestAnimationFrame(() => {
      scheduled = 0;
      // Re-checked per run, not once at load: Lightning is a SPA, so the user can
      // navigate into Setup ▸ Debug Logs without a page load. Testing only at
      // document_idle meant the button never appeared on that path.
      if (isDebugLogsPage()) injectButtons();
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
