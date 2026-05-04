// ── Context menu: right-click any image → Save to Collected ──
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: 'save-image',
        title: 'Save image to Collected',
        contexts: ['image']
    });
    chrome.contextMenus.create({
        id: 'save-page',
        title: 'Save page to Collected',
        contexts: ['page', 'link']
    });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === 'save-image') {
        chrome.storage.local.set({
            pendingItem: {
                type: 'image',
                imageUrl: info.srcUrl,
                pageUrl: tab.url,
                title: tab.title || ''
            }
        });
    }
    if (info.menuItemId === 'save-page') {
        chrome.storage.local.set({
            pendingItem: {
                type: 'url',
                pageUrl: info.linkUrl || tab.url,
                title: tab.title || ''
            }
        });
    }
    // Open popup
    chrome.action.openPopup().catch(() => {
        // openPopup not available in all contexts — user can click the icon
    });
});
