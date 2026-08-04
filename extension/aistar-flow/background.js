// AISTAR → Flow — service worker
// คลิกไอคอน extension = เปิด/ปิด Side Panel (ไม่มี popup)
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

// เผื่อ content script ยังไม่ถูกฉีด (เปิดแท็บ Flow ค้างไว้ก่อนติดตั้ง extension)
// panel จะเรียก ENSURE_CONTENT ก่อนส่งงานทุกครั้ง
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  // ENSURE_CONTENT = Flow (content.js) / ENSURE_SHOPEE = Shopee scraper (content-shopee.js)
  const ensure = (pingType, file) => {
    chrome.tabs
      .sendMessage(msg.tabId, { type: pingType })
      .then(() => sendResponse({ ok: true }))
      .catch(async () => {
        try {
          await chrome.scripting.executeScript({ target: { tabId: msg.tabId }, files: [file] });
          sendResponse({ ok: true, injected: true });
        } catch (e) {
          sendResponse({ ok: false, error: String(e) });
        }
      });
  };
  if (msg?.type === "ENSURE_CONTENT" && msg.tabId) {
    ensure("PING", "content.js");
    return true; // async
  }
  if (msg?.type === "ENSURE_SHOPEE" && msg.tabId) {
    ensure("PING_SHOPEE_V2", "content-shopee.js");
    return true; // async
  }
  return undefined;
});
