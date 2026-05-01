chrome.action.onClicked.addListener(async (tab) => {
    try {
        const url = new URL(tab.url);
        if (url.hostname.endsWith('panopto.com') || url.hostname.endsWith('panopto.eu')) {
            if (url.pathname.includes('/Embed.aspx')) {
                const newUrl = tab.url.replace('/Embed.aspx', '/Viewer.aspx');
                chrome.tabs.update(tab.id, { url: newUrl });
                // We inject a script to notify the user they might need to click again.
                // activeTab permission is lost when navigating.
                return;
            }

            const results = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['payload.js']
            });

            if (results && results[0] && results[0].result) {
                const { videoUrl, name } = results[0].result;
                if (videoUrl) {
                    chrome.downloads.download({
                        url: videoUrl,
                        filename: name || "video.mp4",
                        saveAs: true
                    });
                } else {
                    await chrome.scripting.executeScript({
                        target: { tabId: tab.id },
                        func: () => alert("Could not find video stream URL on this page. Wait for it to load or try another.")
                    });
                }
            }
        } else {
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => alert("Sorry, but I didn't find any videos. Are you sure the address in the search bar is with \"panopto.eu\" or \"panopto.com\" ?")
            });
        }
    } catch (e) {
        console.error(e);
    }
});
