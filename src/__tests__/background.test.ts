/**
 * The background module registers its listeners at import time, so `chrome`
 * has to exist before it loads. Stub it, then require the module.
 */
type MessageListener = (
  message: Record<string, unknown>,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: unknown) => void,
) => boolean | void;

let capturedListener: MessageListener | null = null;

(globalThis as unknown as { chrome: unknown }).chrome = {
  runtime: {
    onMessage: {
      addListener: (fn: MessageListener) => {
        capturedListener = fn;
      },
    },
    getURL: (p: string) => p,
  },
  action: { onClicked: { addListener: () => {} } },
  tabs: { create: () => {} },
  storage: { local: { get: async () => ({}), set: async () => {} } },
};

jest.mock('../api/salesforce', () => ({
  getSessionId: jest.fn(),
  fetchRecentLogIds: jest.fn(),
  fetchLogEntryPoint: jest.fn(),
  isAllowedSalesforceDomain: jest.fn(() => true),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports -- must load after the stub above
const { tabCreateOptions } = require('../background/index') as typeof import('../background/index');
// eslint-disable-next-line @typescript-eslint/no-require-imports -- same module instance the mock above replaces
const salesforceApi = require('../api/salesforce') as {
  getSessionId: jest.Mock;
  fetchRecentLogIds: jest.Mock;
};

/** Flushes the microtask queue so an async handler's `sendResponse` has run. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Covers the decision the Incognito bug lived in: which window the analyzer
 * opens in.
 */
describe('tabCreateOptions', () => {
  const sender = (windowId?: number): chrome.runtime.MessageSender =>
    (windowId === undefined
      ? {}
      : { tab: { windowId } }) as unknown as chrome.runtime.MessageSender;

  it('opens the tab in the window the request came from', () => {
    // The heart of the Incognito bug: without windowId Chrome picks a window on
    // its own, and a private-window request landed in a normal one — a different
    // profile, whose cookie jar has no Salesforce session.
    expect(tabCreateOptions('app.html', sender(42))).toEqual({ url: 'app.html', windowId: 42 });
  });

  it('lets Chrome choose when there is no sender tab', () => {
    // The toolbar action has no originating tab; forcing a windowId there would
    // be inventing one.
    expect(tabCreateOptions('app.html', sender())).toEqual({ url: 'app.html' });
    expect(tabCreateOptions('app.html', undefined)).toEqual({ url: 'app.html' });
  });

  it('never emits an undefined windowId', () => {
    // chrome.tabs.create rejects windowId: undefined rather than ignoring it.
    const opts = tabCreateOptions('app.html', sender());
    expect('windowId' in opts).toBe(false);
  });
});

/**
 * The Debug Logs page never checks for new logs on its own — this is the
 * background half of the polling that lets the content script show a
 * "N new logs" banner. Asks for ids only, never a log body.
 */
describe('getRecentLogIds message handler', () => {
  beforeEach(() => {
    salesforceApi.getSessionId.mockReset();
    salesforceApi.fetchRecentLogIds.mockReset();
  });

  it('returns the ids fetchRecentLogIds resolves with', async () => {
    salesforceApi.getSessionId.mockResolvedValue('sid-123');
    salesforceApi.fetchRecentLogIds.mockResolvedValue(['07L1', '07L2']);
    const sendResponse = jest.fn();

    const keepChannelOpen = capturedListener!(
      { action: 'getRecentLogIds', domain: 'https://x.my.salesforce.com', limit: 5 },
      {},
      sendResponse,
    );

    expect(keepChannelOpen).toBe(true); // async reply — must keep the message channel open
    await flush();

    expect(salesforceApi.fetchRecentLogIds).toHaveBeenCalledWith('https://x.my.salesforce.com', 'sid-123', 5);
    expect(sendResponse).toHaveBeenCalledWith({ ok: true, ids: ['07L1', '07L2'] });
  });

  it('reports no session rather than throwing, when the user is not logged in', async () => {
    salesforceApi.getSessionId.mockResolvedValue(null);
    const sendResponse = jest.fn();

    capturedListener!({ action: 'getRecentLogIds', domain: 'https://x.my.salesforce.com' }, {}, sendResponse);
    await flush();

    expect(salesforceApi.fetchRecentLogIds).not.toHaveBeenCalled();
    expect(sendResponse).toHaveBeenCalledWith({ ok: false, error: 'No session' });
  });

  it('reports a failed fetch rather than throwing', async () => {
    salesforceApi.getSessionId.mockResolvedValue('sid-123');
    salesforceApi.fetchRecentLogIds.mockRejectedValue(new Error('Failed to fetch recent logs: 500'));
    const sendResponse = jest.fn();

    capturedListener!({ action: 'getRecentLogIds', domain: 'https://x.my.salesforce.com' }, {}, sendResponse);
    await flush();

    expect(sendResponse).toHaveBeenCalledWith({ ok: false, error: 'Failed to fetch recent logs: 500' });
  });
});
