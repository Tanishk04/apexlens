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

function main(): void {
  if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) return;
  if (!isDebugLogsPage()) return;

  injectButtons();

  // Classic tables re-render on sort/refresh; re-inject on DOM changes.
  const observer = new MutationObserver(() => injectButtons());
  observer.observe(document.body, { childList: true, subtree: true });
}

main();
