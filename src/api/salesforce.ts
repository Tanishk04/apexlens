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

/**
 * Basic interface for ApexLog record.
 */
export interface ApexLogRecord {
  Id: string;
  Status: string;
  StartTime: string;
  LogLength: number;
  Operation: string;
  LogUser?: { Name: string };
}

/**
 * Fetches recent debug logs from the active org.
 */
export async function fetchRecentLogs(domain: string, sessionId: string): Promise<ApexLogRecord[]> {
  const query = 'SELECT Id, Status, StartTime, LogLength, LogUser.Name, Operation FROM ApexLog ORDER BY StartTime DESC LIMIT 20';
  const url = `${domain}/services/data/v61.0/tooling/query/?q=${encodeURIComponent(query)}`;

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${sessionId}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch logs: ${response.statusText}`);
  }

  const data = await response.json();
  return data.records as ApexLogRecord[];
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
