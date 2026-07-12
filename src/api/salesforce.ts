function readCookie(
  getCookie: (callback: (cookie: chrome.cookies.Cookie | null) => void) => void
): Promise<string | null> {
  return new Promise((resolve) => {
    getCookie((cookie) => {
      if (chrome.runtime.lastError) {
        console.warn('Cookie lookup failed:', chrome.runtime.lastError.message);
        resolve(null);
        return;
      }
      resolve(cookie?.value ?? null);
    });
  });
}

/**
 * Fetches the active Session ID for a given Salesforce domain.
 */
export async function getSessionId(domain: string): Promise<string | null> {
  if (typeof chrome === 'undefined' || !chrome.cookies) {
    console.warn('chrome.cookies API is not available.');
    return null;
  }

  const url = domain.endsWith('/') ? domain : `${domain}/`;
  const hostname = new URL(url).hostname;

  const byUrl = await readCookie((callback) => {
    chrome.cookies.get({ url, name: 'sid' }, callback);
  });
  if (byUrl) return byUrl;

  return readCookie((callback) => {
    chrome.cookies.getAll({ domain: hostname, name: 'sid' }, (cookies) => {
      callback(cookies[0] ?? null);
    });
  });
}

// Suffixes matching this extension's own host_permissions (manifest.json) — the
// only domains the extension is actually granted cookie/fetch access to. Used to
// validate `domain` before it's used to read cookies or fetch a log body, since
// that value can arrive via a URL query param (see App.tsx) and must not be
// trusted blindly.
const ALLOWED_HOST_SUFFIXES = ['.salesforce.com', '.force.com', '.salesforce-setup.com'];

/** Is `domain` (an origin string, e.g. `https://foo.my.salesforce.com`) one this
 * extension actually has host permission for? Fails closed on anything else,
 * including malformed URLs and non-https schemes. */
export function isAllowedSalesforceDomain(domain: string): boolean {
  try {
    const url = new URL(domain);
    if (url.protocol !== 'https:') return false;
    const hostname = url.hostname;
    return ALLOWED_HOST_SUFFIXES.some(
      (suffix) => hostname === suffix.slice(1) || hostname.endsWith(suffix),
    );
  } catch {
    return false;
  }
}

/**
 * Downloads the raw body of a specific debug log.
 */
export async function fetchLogBody(domain: string, sessionId: string, logId: string): Promise<string> {
  const url = `${domain}/services/data/v61.0/tooling/sobjects/ApexLog/${logId}/Body`;
  
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${sessionId}`,
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch log body: ${response.statusText}`);
  }

  return await response.text();
}
