document.addEventListener('DOMContentLoaded', async () => {
    // Views
    const loadingView = document.getElementById('loadingView');
    const nonPanoptoView = document.getElementById('nonPanoptoView');
    const embedView = document.getElementById('embedView');
    const streamsView = document.getElementById('streamsView');
    const noStreamsView = document.getElementById('noStreamsView');
    const toast = document.getElementById('toast');

    // UI elements
    const sessionTitle = document.getElementById('sessionTitle');
    const streamCountBadge = document.getElementById('streamCountBadge');
    const streamList = document.getElementById('streamList');
    const downloadAllBtn = document.getElementById('downloadAllBtn');
    const watchInViewerBtn = document.getElementById('watchInViewerBtn');
    const headerViewerBtn = document.getElementById('headerViewerBtn');
    const openOfflineViewerBtn = document.getElementById('openOfflineViewerBtn');
    const redirectToViewerBtn = document.getElementById('redirectToViewerBtn');
    const retryScanBtn = document.getElementById('retryScanBtn');

    // Native in-page pop-out elements
    const nativePopoutScreenBtn = document.getElementById('nativePopoutScreenBtn');
    const nativePopoutCameraBtn = document.getElementById('nativePopoutCameraBtn');

    // Captions & Transcripts elements
    const captionsSection = document.getElementById('captionsSection');
    const downloadSrtBtn = document.getElementById('downloadSrtBtn');
    const downloadVttBtn = document.getElementById('downloadVttBtn');
    const downloadTxtBtn = document.getElementById('downloadTxtBtn');
    const copyTranscriptBtn = document.getElementById('copyTranscriptBtn');

    let currentTab = null;
    let extractedData = null;

    function showView(view) {
        [loadingView, nonPanoptoView, embedView, streamsView, noStreamsView].forEach(v => {
            if (v) v.classList.add('hidden');
        });
        if (view) view.classList.remove('hidden');
    }

    function showToast(message) {
        toast.textContent = message;
        toast.classList.remove('hidden');
        setTimeout(() => toast.classList.add('hidden'), 2600);
    }

    function downloadTextFile(content, filename, mimeType = 'text/plain') {
        if (!content) return;
        const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
        const url = URL.createObjectURL(blob);
        chrome.downloads.download({
            url: url,
            filename: filename,
            saveAs: true
        }, (downloadId) => {
            setTimeout(() => URL.revokeObjectURL(url), 10000);
            if (chrome.runtime.lastError) {
                console.warn("Download text error:", chrome.runtime.lastError);
            }
        });
    }

    function openViewerWithSession(sessionData) {
        if (sessionData && sessionData.streams && sessionData.streams.length > 0) {
            chrome.storage.local.set({ viewerSession: sessionData }, () => {
                chrome.tabs.create({ url: chrome.runtime.getURL('viewer.html?source=session') });
            });
        } else {
            chrome.tabs.create({ url: chrome.runtime.getURL('viewer.html') });
        }
    }

    headerViewerBtn.addEventListener('click', () => {
        openViewerWithSession(extractedData);
    });

    openOfflineViewerBtn.addEventListener('click', () => {
        openViewerWithSession(null);
    });

    retryScanBtn.addEventListener('click', () => {
        scanActiveTab();
    });

    redirectToViewerBtn.addEventListener('click', () => {
        if (currentTab && currentTab.url) {
            const newUrl = currentTab.url.replace('/Embed.aspx', '/Viewer.aspx');
            chrome.tabs.update(currentTab.id, { url: newUrl });
            window.close();
        }
    });

    // Native in-page pop-out triggers
    async function triggerNativePopout(targetType) {
        if (!currentTab || !currentTab.id) return;
        try {
            const results = await chrome.scripting.executeScript({
                target: { tabId: currentTab.id },
                func: (type) => {
                    if (typeof window.__panoptoToggleTarget === 'function') {
                        return window.__panoptoToggleTarget(type);
                    }
                    return { success: false, error: 'Controller not ready' };
                },
                args: [targetType]
            });

            if (results && results[0] && results[0].result) {
                const res = results[0].result;
                if (res.success) {
                    if (res.state === 'entered') {
                        showToast(`Popped out ${targetType === 'primary' ? 'Camera' : 'Screen'} to floating window!`);
                    } else {
                        showToast(`Rejoined ${targetType === 'primary' ? 'Camera' : 'Screen'} to page`);
                    }
                } else {
                    showToast(res.error || "Could not pop out video");
                }
            }
        } catch (err) {
            console.warn("Pop-out trigger error:", err);
            showToast("Click the floating button directly on the Panopto player");
        }
    }

    if (nativePopoutScreenBtn) {
        nativePopoutScreenBtn.addEventListener('click', () => triggerNativePopout('secondary'));
    }

    if (nativePopoutCameraBtn) {
        nativePopoutCameraBtn.addEventListener('click', () => triggerNativePopout('primary'));
    }

    function renderStreams(data) {
        extractedData = data;
        const streams = data.streams || [];
        sessionTitle.textContent = data.title || "Panopto Lecture";
        sessionTitle.title = data.title || "";
        streamCountBadge.textContent = `${streams.length} Screen${streams.length === 1 ? '' : 's'}`;

        // Closed Captions & Transcripts
        if (data.captions && data.captions.hasCaptions) {
            captionsSection.classList.remove('hidden');
            const cleanTitle = (data.title || "Lecture").replace(/[<>:"\/\\|?*\x00-\x1F]/g, '_').trim().slice(0, 100);

            downloadSrtBtn.onclick = () => {
                downloadTextFile(data.captions.srt, `${cleanTitle} - Subtitles.srt`, 'application/x-subrip');
                showToast("Downloading .SRT subtitles...");
            };

            downloadVttBtn.onclick = () => {
                downloadTextFile(data.captions.vtt, `${cleanTitle} - Subtitles.vtt`, 'text/vtt');
                showToast("Downloading .VTT subtitles...");
            };

            downloadTxtBtn.onclick = () => {
                downloadTextFile(data.captions.txt, `${cleanTitle} - Transcript.txt`, 'text/plain');
                showToast("Downloading text transcript...");
            };

            copyTranscriptBtn.onclick = async () => {
                try {
                    await navigator.clipboard.writeText(data.captions.txt);
                    showToast("Transcript copied to clipboard!");
                } catch(e) {
                    showToast("Failed to copy transcript");
                }
            };
        } else {
            captionsSection.classList.add('hidden');
        }

        streamList.innerHTML = '';

        streams.forEach((stream) => {
            const item = document.createElement('div');
            item.className = 'stream-item';

            const isPrimary = stream.type === 'primary';
            const isPodcast = stream.type === 'podcast';
            const iconType = isPodcast ? 'podcast' : (isPrimary ? 'primary' : 'secondary');

            let iconSvg = '';
            if (isPodcast) {
                iconSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect><line x1="7" y1="2" x2="7" y2="22"></line><line x1="17" y1="2" x2="17" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line><line x1="2" y1="7" x2="7" y2="7"></line><line x1="2" y1="17" x2="7" y2="17"></line><line x1="17" y1="17" x2="22" y2="17"></line><line x1="17" y1="7" x2="22" y2="7"></line></svg>`;
            } else if (isPrimary) {
                iconSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 7l-7 5 7 5V7z"></path><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>`;
            } else {
                iconSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>`;
            }

            const format = stream.url.includes('.m3u8') ? 'HLS Playlist' : 'MP4 Video';

            item.innerHTML = `
                <div class="stream-details">
                    <div class="stream-icon ${iconType}">
                        ${iconSvg}
                    </div>
                    <div class="stream-meta">
                        <span class="stream-title" title="${stream.title}">${stream.title}</span>
                        <span class="stream-sub">${format}</span>
                    </div>
                </div>
                <div class="stream-buttons">
                    <button class="icon-btn copy-url-btn" title="Copy Stream URL">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                        </svg>
                    </button>
                    <button class="stream-download-btn" title="Download this stream">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                            <polyline points="7 10 12 15 17 10"></polyline>
                            <line x1="12" y1="15" x2="12" y2="3"></line>
                        </svg>
                        <span>Download</span>
                    </button>
                </div>
            `;

            // Copy Link
            const copyBtn = item.querySelector('.copy-url-btn');
            copyBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                try {
                    await navigator.clipboard.writeText(stream.url);
                    showToast("Link copied to clipboard!");
                } catch(err) {
                    showToast("Failed to copy link");
                }
            });

            // Download Single
            const dlBtn = item.querySelector('.stream-download-btn');
            dlBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                chrome.runtime.sendMessage({
                    action: 'DOWNLOAD_STREAM',
                    url: stream.url,
                    filename: stream.filename,
                    saveAs: true
                }, (response) => {
                    if (response && response.success) {
                        showToast(`Downloading ${stream.title}...`);
                    }
                });
            });

            streamList.appendChild(item);
        });

        // Download All button
        downloadAllBtn.onclick = () => {
            chrome.runtime.sendMessage({
                action: 'DOWNLOAD_ALL',
                streams: streams
            }, (response) => {
                if (response && response.success) {
                    showToast(`Started downloading ${streams.length} screens!`);
                }
            });
        };

        // Watch in Smart Viewer button (Live streaming, no download)
        watchInViewerBtn.onclick = () => {
            openViewerWithSession(extractedData);
        };

        showView(streamsView);
    }

    async function scanActiveTab() {
        showView(loadingView);

        try {
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tabs || tabs.length === 0) {
                showView(nonPanoptoView);
                return;
            }

            currentTab = tabs[0];
            if (!currentTab.url || !currentTab.url.startsWith('http')) {
                showView(nonPanoptoView);
                return;
            }

            const url = new URL(currentTab.url);
            const host = url.hostname.toLowerCase();
            const path = url.pathname.toLowerCase();
            const isPanopto = host.includes('panopto') || path.includes('/panopto/');



            if (!isPanopto) {
                showView(nonPanoptoView);
                return;
            }

            if (path.includes('/embed.aspx')) {
                showView(embedView);
                return;
            }

            // 1. Inject native in-page pop-out controller (adds in-page floating buttons)
            chrome.scripting.executeScript({
                target: { tabId: currentTab.id },
                files: ['native_popout.js']
            }).catch(e => console.warn("Native popout injection notice:", e));

            // 2. Extract multi-screen streams
            const results = await chrome.scripting.executeScript({
                target: { tabId: currentTab.id },
                world: 'MAIN',
                files: ['payload.js']
            });

            if (results && results[0] && results[0].result) {
                const data = results[0].result;
                if (data.streams && data.streams.length > 0) {
                    renderStreams(data);
                } else if (data.videoUrl) {
                    renderStreams({
                        title: data.name.replace(/\.mp4$/i, ''),
                        streams: [{
                            id: 'stream-0',
                            title: 'Primary Video',
                            type: 'primary',
                            url: data.videoUrl,
                            filename: data.name
                        }]
                    });
                } else {
                    showView(noStreamsView);
                }
            } else {
                showView(noStreamsView);
            }
        } catch (err) {
            console.error("Popup scan failed:", err);
            showView(noStreamsView);
        }
    }

    scanActiveTab();
});
