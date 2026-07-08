// Listen for messages from the popup or other extension parts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'openAppTab') {
    const logId = message.logId;
    const domain = message.domain;
    
    // Construct the URL to our internal app HTML page
    const appUrl = chrome.runtime.getURL(`src/app/index.html?logId=${logId}&domain=${encodeURIComponent(domain)}`);
    
    // Open it in a new tab
    chrome.tabs.create({ url: appUrl });
    
    sendResponse({ success: true });
  }
});
