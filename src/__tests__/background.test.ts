/**
 * The background module registers its listeners at import time, so `chrome`
 * has to exist before it loads. Stub it, then require the module.
 */
(globalThis as unknown as { chrome: unknown }).chrome = {
  runtime: { onMessage: { addListener: () => {} }, getURL: (p: string) => p },
  action: { onClicked: { addListener: () => {} } },
  tabs: { create: () => {} },
  storage: { local: { get: async () => ({}), set: async () => {} } },
};

// eslint-disable-next-line @typescript-eslint/no-require-imports -- must load after the stub above
const { tabCreateOptions } = require('../background/index') as typeof import('../background/index');

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
