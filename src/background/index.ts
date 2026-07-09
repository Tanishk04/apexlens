/**
 * Maps setup-domain origins to the API-capable My-Domain origin. The Debug
 * Logs setup page can live on *.salesforce-setup.com, whose cookies/API are
 * on the matching *.salesforce.com host.
 */
function apiDomainFor(origin: string): string {
  return origin.replace('.salesforce-setup.com', '.salesforce.com');
}

// Content script (Debug Logs page) asks us to open the analyzer for a log.
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'openAppTab') {
    const domain = apiDomainFor(message.domain as string);
    const appUrl = chrome.runtime.getURL(
      `src/app/index.html?logId=${message.logId}&domain=${encodeURIComponent(domain)}`,
    );
    chrome.tabs.create({ url: appUrl });
    sendResponse({ success: true });
  }
});

// Toolbar icon (no popup): open the analyzer standalone — user can Open a
// downloaded .log file from there.
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL('src/app/index.html') });
});
