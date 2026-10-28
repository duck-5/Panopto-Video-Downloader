// Background Service Worker for Panopto Video Downloader

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'DOWNLOAD_STREAM') {
        const { url, filename, saveAs } = message;
        if (!url) {
            sendResponse({ success: false, error: 'No URL provided' });
            return;
        }

        chrome.downloads.download({
            url: url,
            filename: filename || 'video.mp4',
            saveAs: typeof saveAs === 'boolean' ? saveAs : true
        }, (downloadId) => {
            if (chrome.runtime.lastError) {
                console.error("Download error:", chrome.runtime.lastError);
                sendResponse({ success: false, error: chrome.runtime.lastError.message });
            } else {
                sendResponse({ success: true, downloadId });
            }
        });
        return true; // Keep message channel open for async response
    }

    if (message.action === 'DOWNLOAD_ALL') {
        const { streams } = message;
        if (!Array.isArray(streams) || streams.length === 0) {
            sendResponse({ success: false, error: 'No streams to download' });
            return;
        }

        // Trigger downloads with a slight delay between them to prevent browser throttling
        streams.forEach((stream, index) => {
            setTimeout(() => {
                chrome.downloads.download({
                    url: stream.url,
                    filename: stream.filename || `video_${index + 1}.mp4`,
                    saveAs: false // Auto save to downloads folder for bulk downloads
                }, (downloadId) => {
                    if (chrome.runtime.lastError) {
                        console.error("Batch download error:", chrome.runtime.lastError);
                    }
                });
            }, index * 400);
        });

        sendResponse({ success: true, count: streams.length });
        return true;
    }

    if (message.action === 'OPEN_SMART_VIEWER') {
        const viewerUrl = chrome.runtime.getURL('viewer.html') + (message.query || '');
        chrome.tabs.create({ url: viewerUrl });
        sendResponse({ success: true });
        return true;
    }

    if (message.action === 'REDIRECT_TO_VIEWER') {
        const { tabId, url } = message;
        const newUrl = url.replace('/Embed.aspx', '/Viewer.aspx');
        chrome.tabs.update(tabId, { url: newUrl });
        sendResponse({ success: true });
        return true;
    }
});
