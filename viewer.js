/**
 * Panopto Smart Dual-Screen Viewer Engine
 * Supports multi-screen video synchronization, layout presets,
 * and dual-tab split viewing via BroadcastChannel and IndexedDB.
 */

// ==========================================
// IndexedDB Helper for Large Video Files
// ==========================================
const DB_NAME = 'PanoptoViewerDB';
const DB_VERSION = 1;
const STORE_NAME = 'sessions';

function openDatabase() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function saveSessionToDB(sessionId, data) {
    try {
        const db = await openDatabase();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            store.put(data, sessionId);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    } catch (e) {
        console.warn("IndexedDB save failed:", e);
    }
}

async function getSessionFromDB(sessionId) {
    try {
        const db = await openDatabase();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const req = store.get(sessionId);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    } catch (e) {
        console.warn("IndexedDB get failed:", e);
        return null;
    }
}

// ==========================================
// Main Viewer Controller
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
    // Elements
    const body = document.body;
    const video1 = document.getElementById('video1');
    const video2 = document.getElementById('video2');
    const container1 = document.getElementById('streamContainer1');
    const container2 = document.getElementById('streamContainer2');
    const splitDivider = document.getElementById('splitDivider');
    const videoStage = document.getElementById('videoStage');
    const sessionHeading = document.getElementById('sessionHeading');

    // Controls
    const playPauseBtn = document.getElementById('playPauseBtn');
    const playIcon = document.getElementById('playIcon');
    const pauseIcon = document.getElementById('pauseIcon');
    const rewindBtn = document.getElementById('rewindBtn');
    const forwardBtn = document.getElementById('forwardBtn');
    const currentTimeEl = document.getElementById('currentTime');
    const totalDurationEl = document.getElementById('totalDuration');
    const syncStatus = document.getElementById('syncStatus');
    const syncDot = syncStatus.querySelector('.sync-dot');
    const syncLabel = syncStatus.querySelector('.sync-label');

    // Timeline
    const timelineContainer = document.getElementById('timelineContainer');
    const timelinePlayed = document.getElementById('timelinePlayed');
    const timelineBuffer = document.getElementById('timelineBuffer');
    const timelineThumb = document.getElementById('timelineThumb');
    const timelineTooltip = document.getElementById('timelineTooltip');

    // Audio & Speed
    const masterMuteBtn = document.getElementById('masterMuteBtn');
    const masterVolIcon = document.getElementById('masterVolIcon');
    const masterVolSlider = document.getElementById('masterVolSlider');
    const audioSrcBtns = document.querySelectorAll('.audio-src-btn');
    const streamMuteBtn1 = document.getElementById('streamMuteBtn1');
    const streamVol1 = document.getElementById('streamVol1');
    const streamMuteBtn2 = document.getElementById('streamMuteBtn2');
    const streamVol2 = document.getElementById('streamVol2');
    const speedBtn = document.getElementById('speedBtn');
    const speedLabel = document.getElementById('speedLabel');
    const speedMenu = document.getElementById('speedMenu');
    const speedOptions = document.querySelectorAll('.speed-option');
    const speedDecBtn = document.getElementById('speedDecBtn');
    const speedIncBtn = document.getElementById('speedIncBtn');
    const speedCustomInput = document.getElementById('speedCustomInput');

    // Navigation & Actions
    const presetBtns = document.querySelectorAll('.preset-btn');
    const swapBtn = document.getElementById('swapBtn');
    const splitTabsBtn = document.getElementById('splitTabsBtn');
    const fullscreenBtn = document.getElementById('fullscreenBtn');
    const splitBanner = document.getElementById('splitBanner');
    const splitBannerText = document.getElementById('splitBannerText');
    const rejoinBtn = document.getElementById('rejoinBtn');
    const secondaryFloatingMerge = document.getElementById('secondaryFloatingMerge');
    const secondaryRejoinBtn = document.getElementById('secondaryRejoinBtn');
    const toast = document.getElementById('viewerToast');
    const timeLeftEl = document.getElementById('timeLeft');
    const ccBtn = document.getElementById('ccBtn');
    const uploadLandingView = document.getElementById('uploadLandingView');
    const landingDropzone = document.getElementById('landingDropzone');
    const landingSelectBtn = document.getElementById('landingSelectBtn');
    const landingUrlBtn = document.getElementById('landingUrlBtn');
    const landingFileInput = document.getElementById('landingFileInput');
    const presetsBar = document.getElementById('presetsBar');

    // Modals & Sources
    const sourceModalBtn = document.getElementById('sourceModalBtn');
    const sourceModal = document.getElementById('sourceModal');
    const closeSourceModalBtn = document.getElementById('closeSourceModalBtn');
    const shortcutsBtn = document.getElementById('shortcutsBtn');
    const shortcutsModal = document.getElementById('shortcutsModal');
    const closeShortcutsModalBtn = document.getElementById('closeShortcutsModalBtn');

    // Drop states & inputs
    const dropEmpty1 = document.getElementById('dropEmpty1');
    const dropEmpty2 = document.getElementById('dropEmpty2');
    const fileInput1 = document.getElementById('fileInput1');
    const fileInput2 = document.getElementById('fileInput2');
    const batchDropzone = document.getElementById('batchDropzone');
    const batchFileInput = document.getElementById('batchFileInput');
    const batchSelectBtn = document.getElementById('batchSelectBtn');
    const individualFile1 = document.getElementById('individualFile1');
    const individualFile2 = document.getElementById('individualFile2');
    const urlInput1 = document.getElementById('urlInput1');
    const urlInput2 = document.getElementById('urlInput2');
    const loadUrlsBtn = document.getElementById('loadUrlsBtn');

    // App State
    let isMasterTab = true;
    let isSecondaryTab = false;
    let sessionId = null;
    let syncChannel = null;
    let isPlaying = false;
    let isSeeking = false;
    let activeAudioSource = 'primary'; // 'primary', 'both', 'secondary'
    let currentPreset = 'preset-split-equal';
    let isSwapped = false;
    let isSingleSwapped = false;
    let stream1Data = null; // { title, url, file }
    let stream2Data = null; // { title, url, file }
    let syncHeartbeatInterval = null;
    let isDraggingDivider = false;
    let hlsInstance1 = null;
    let hlsInstance2 = null;

    // Toast helper
    function showToast(msg) {
        toast.textContent = msg;
        toast.classList.remove('hidden');
        setTimeout(() => toast.classList.add('hidden'), 2500);
    }

    // Time formatting helper
    function formatTime(seconds) {
        if (isNaN(seconds) || seconds < 0) return '00:00';
        const s = Math.floor(seconds % 60);
        const m = Math.floor((seconds / 60) % 60);
        const h = Math.floor(seconds / 3600);
        const pad = (n) => String(n).padStart(2, '0');
        if (h > 0) {
            return `${pad(h)}:${pad(m)}:${pad(s)}`;
        }
        return `${pad(m)}:${pad(s)}`;
    }

    // ==========================================
    // Core Dual-Playback Engine
    // ==========================================

    async function playBoth(fromRemote = false) {
        isPlaying = true;
        updatePlayPauseIcons();

        try {
            if (!isSecondaryTab && video1.src) await video1.play();
            if (!isMasterTab && video2.src) await video2.play();
            if (isMasterTab && !isSecondaryTab && !body.classList.contains('split-mode-master') && video2.src) {
                await video2.play();
            }
        } catch (e) {
            console.warn("Autoplay / play prevented:", e);
        }

        if (!fromRemote && syncChannel) {
            const masterTime = isSecondaryTab ? video2.currentTime : video1.currentTime;
            syncChannel.postMessage({ type: 'PLAY', time: masterTime });
        }
    }

    function pauseBoth(fromRemote = false) {
        isPlaying = false;
        updatePlayPauseIcons();

        if (video1) video1.pause();
        if (video2) video2.pause();

        if (!fromRemote && syncChannel) {
            const masterTime = isSecondaryTab ? video2.currentTime : video1.currentTime;
            syncChannel.postMessage({ type: 'PAUSE', time: masterTime });
        }
    }

    function togglePlayPause() {
        if (isPlaying) {
            pauseBoth();
        } else {
            playBoth();
        }
    }

    function seekBoth(time, fromRemote = false) {
        const clamped = Math.max(0, Math.min(time, getDuration()));
        if (video1.src) video1.currentTime = clamped;
        if (video2.src) video2.currentTime = clamped;
        updateTimelineUI(clamped);

        if (!fromRemote && syncChannel) {
            syncChannel.postMessage({ type: 'SEEK', time: clamped });
        }
    }

    function setSpeed(rate, fromRemote = false) {
        video1.playbackRate = rate;
        video2.playbackRate = rate;
        speedLabel.textContent = `${rate}x`;

        speedOptions.forEach(opt => {
            if (parseFloat(opt.dataset.speed) === rate) {
                opt.classList.add('active');
            } else {
                opt.classList.remove('active');
            }
        });

        if (!fromRemote && syncChannel) {
            syncChannel.postMessage({ type: 'RATE', rate });
        }
    }

    function getDuration() {
        const d1 = video1.duration || 0;
        const d2 = video2.duration || 0;
        return Math.max(d1, d2) || 0;
    }

    function getMasterTime() {
        if (isSecondaryTab) return video2.currentTime || 0;
        return video1.currentTime || 0;
    }

    function updatePlayPauseIcons() {
        if (isPlaying) {
            playIcon.classList.add('hidden');
            pauseIcon.classList.remove('hidden');
        } else {
            playIcon.classList.remove('hidden');
            pauseIcon.classList.add('hidden');
        }
    }

    // Drift Detection & Synchronizer (Master-Slave alignment)
    function monitorSync() {
        if (!isMasterTab && !isSecondaryTab) {
            // Both videos in single window
            if (video1.src && video2.src && !video1.paused && !video2.paused) {
                const diff = Math.abs(video1.currentTime - video2.currentTime);
                if (diff > 0.15) {
                    syncDot.className = 'sync-dot syncing';
                    syncLabel.textContent = 'Re-aligning...';
                    video2.currentTime = video1.currentTime;
                } else {
                    syncDot.className = 'sync-dot synced';
                    syncLabel.textContent = 'Synced';
                }
            }
        }
    }

    setInterval(monitorSync, 400);

    // Timeline Scrubber Updates
    function updateTimelineUI(currentTime) {
        const duration = getDuration();
        currentTimeEl.textContent = formatTime(currentTime);
        totalDurationEl.textContent = formatTime(duration);

        if (timeLeftEl && duration > 0) {
            const rate = video1.playbackRate || 1.0;
            const remainingSec = Math.max(0, duration - currentTime);
            const speedAdjustedSec = remainingSec / rate;
            timeLeftEl.textContent = `(-${formatTime(speedAdjustedSec)} left)`;
        }

        if (duration > 0) {
            const percent = (currentTime / duration) * 100;
            timelinePlayed.style.width = `${percent}%`;
            timelineThumb.style.left = `${percent}%`;
        }
    }

    function updateBufferUI() {
        const targetVideo = isSecondaryTab ? video2 : video1;
        if (targetVideo.buffered.length > 0 && targetVideo.duration > 0) {
            const bufferedEnd = targetVideo.buffered.end(targetVideo.buffered.length - 1);
            const percent = (bufferedEnd / targetVideo.duration) * 100;
            timelineBuffer.style.width = `${percent}%`;
        }
    }

    video1.addEventListener('timeupdate', () => {
        if (!isSeeking && !isSecondaryTab) {
            updateTimelineUI(video1.currentTime);
            updateBufferUI();
        }
    });

    video2.addEventListener('timeupdate', () => {
        if (!isSeeking && isSecondaryTab) {
            updateTimelineUI(video2.currentTime);
            updateBufferUI();
        }
    });

    video1.addEventListener('loadedmetadata', () => {
        totalDurationEl.textContent = formatTime(getDuration());
    });

    video2.addEventListener('loadedmetadata', () => {
        totalDurationEl.textContent = formatTime(getDuration());
    });

    // Timeline Scrubber Interaction
    function handleTimelineSeek(e) {
        const rect = timelineContainer.getBoundingClientRect();
        const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const duration = getDuration();
        const targetTime = pos * duration;
        seekBoth(targetTime);
    }

    timelineContainer.addEventListener('mousedown', (e) => {
        isSeeking = true;
        handleTimelineSeek(e);

        const onMouseMove = (moveEvent) => {
            handleTimelineSeek(moveEvent);
        };

        const onMouseUp = () => {
            isSeeking = false;
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    });

    timelineContainer.addEventListener('mousemove', (e) => {
        const rect = timelineContainer.getBoundingClientRect();
        const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const duration = getDuration();
        const hoverTime = pos * duration;
        timelineTooltip.textContent = formatTime(hoverTime);
        timelineTooltip.style.left = `${pos * 100}%`;
    });

    // ==========================================
    // Audio Routing & Controls
    // ==========================================

    function updateAudioRouting() {
        const masterVol = parseFloat(masterVolSlider.value);

        if (activeAudioSource === 'primary') {
            video1.muted = false;
            video2.muted = true;
            video1.volume = masterVol * parseFloat(streamVol1.value);
            video2.volume = 0;
            streamVol2.value = 0;
        } else if (activeAudioSource === 'secondary') {
            video1.muted = true;
            video2.muted = false;
            video1.volume = 0;
            video2.volume = masterVol * parseFloat(streamVol2.value || 1);
            streamVol1.value = 0;
        } else { // both
            video1.muted = false;
            video2.muted = false;
            video1.volume = masterVol * parseFloat(streamVol1.value);
            video2.volume = masterVol * parseFloat(streamVol2.value);
        }
    }

    audioSrcBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            audioSrcBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeAudioSource = btn.dataset.src;
            if (activeAudioSource === 'secondary' && parseFloat(streamVol2.value) === 0) {
                streamVol2.value = 1;
            }
            updateAudioRouting();
            showToast(`Audio Source: ${btn.textContent}`);
        });
    });

    masterVolSlider.addEventListener('input', updateAudioRouting);

    masterMuteBtn.addEventListener('click', () => {
        if (video1.muted && video2.muted) {
            updateAudioRouting();
            showToast("Unmuted");
        } else {
            video1.muted = true;
            video2.muted = true;
            showToast("Muted");
        }
    });

    streamMuteBtn1.addEventListener('click', () => {
        video1.muted = !video1.muted;
    });

    streamVol1.addEventListener('input', updateAudioRouting);

    streamMuteBtn2.addEventListener('click', () => {
        video2.muted = !video2.muted;
    });

    streamVol2.addEventListener('input', updateAudioRouting);

    // Speed Menu
    speedBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        speedMenu.classList.toggle('hidden');
    });

    speedOptions.forEach(opt => {
        opt.addEventListener('click', () => {
            const speed = parseFloat(opt.dataset.speed);
            setSpeed(speed);
            speedMenu.classList.add('hidden');
            showToast(`Speed: ${speed}x`);
        });
    });

    document.addEventListener('click', () => {
        speedMenu.classList.add('hidden');
    });

    // ==========================================
    // Layout Presets & Drag Resizer
    // ==========================================

    function setPreset(presetClass) {
        currentPreset = presetClass;

        // Clear existing preset classes
        body.classList.remove('preset-split-equal', 'preset-focus-screen', 'preset-focus-presenter', 'preset-pip', 'preset-stacked', 'preset-single');
        body.classList.add(presetClass);

        presetBtns.forEach(btn => {
            if (btn.dataset.preset === presetClass) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        // Reset any inline custom divider widths
        container1.style.width = '';
        container2.style.width = '';
    }

    presetBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            setPreset(btn.dataset.preset);
        });
    });

    // Draggable Split Divider
    splitDivider.addEventListener('mousedown', (e) => {
        if (body.classList.contains('preset-pip') || body.classList.contains('preset-single')) return;
        isDraggingDivider = true;
        splitDivider.classList.add('active');

        const onMouseMove = (moveEvent) => {
            if (!isDraggingDivider) return;
            const stageRect = videoStage.getBoundingClientRect();

            if (body.classList.contains('preset-stacked')) {
                // Vertical drag
                const pos = Math.max(0.15, Math.min(0.85, (moveEvent.clientY - stageRect.top) / stageRect.height));
                container1.style.height = `calc(${pos * 100}% - 3px)`;
                container2.style.height = `calc(${(1 - pos) * 100}% - 3px)`;
            } else {
                // Horizontal drag
                const pos = Math.max(0.15, Math.min(0.85, (moveEvent.clientX - stageRect.left) / stageRect.width));
                container1.style.width = `calc(${pos * 100}% - 3px)`;
                container2.style.width = `calc(${(1 - pos) * 100}% - 3px)`;
            }
        };

        const onMouseUp = () => {
            isDraggingDivider = false;
            splitDivider.classList.remove('active');
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    });

    // Swap Streams
    swapBtn.addEventListener('click', () => {
        if (body.classList.contains('preset-single')) {
            isSingleSwapped = !isSingleSwapped;
            body.classList.toggle('single-swapped', isSingleSwapped);
            showToast(isSingleSwapped ? "Focused on Screen" : "Focused on Camera");
            return;
        }

        isSwapped = !isSwapped;
        // Swap video elements DOM order
        if (isSwapped) {
            videoStage.insertBefore(container2, container1);
        } else {
            videoStage.insertBefore(container1, container2);
        }
        showToast("Swapped Stream Layout");
    });

    // Fullscreen Toggle
    fullscreenBtn.addEventListener('click', () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(() => {});
        } else {
            document.exitFullscreen().catch(() => {});
        }
    });

    // ==========================================
    // Feature 2.1: Multi-Tab Split Engine
    // ==========================================

    const urlParams = new URLSearchParams(window.location.search);
    const roleParam = urlParams.get('role');
    const sessionParam = urlParams.get('session');

    if (roleParam === 'secondary' && sessionParam) {
        // TAB 2: SECONDARY MONITOR MODE
        isSecondaryTab = true;
        isMasterTab = false;
        sessionId = sessionParam;
        body.classList.add('split-mode-secondary');
        document.title = "[Tab 2 - Multi-Monitor] Screen View";

        if (secondaryFloatingMerge) secondaryFloatingMerge.classList.remove('hidden');
        if (uploadLandingView) uploadLandingView.classList.add('hidden');

        syncChannel = new BroadcastChannel(`panopto_sync_${sessionId}`);

        // Notify Master that Tab 2 is ready
        syncChannel.postMessage({ type: 'SECONDARY_READY' });

        syncChannel.onmessage = async (e) => {
            const msg = e.data;
            if (!msg) return;

            switch (msg.type) {
                case 'INIT_DATA':
                    if (msg.title) sessionHeading.textContent = msg.title;
                    if (msg.stream2) {
                        loadStream(2, msg.stream2);
                    } else if (msg.localSessionId) {
                        // Load from IndexedDB
                        const cached = await getSessionFromDB(msg.localSessionId);
                        if (cached && cached.stream2) loadStream(2, cached.stream2);
                    }
                    if (msg.currentTime) seekBoth(msg.currentTime, true);
                    if (msg.isPlaying) playBoth(true);
                    if (msg.playbackRate) setSpeed(msg.playbackRate, true);
                    break;

                case 'PLAY':
                    seekBoth(msg.time, true);
                    playBoth(true);
                    break;

                case 'PAUSE':
                    seekBoth(msg.time, true);
                    pauseBoth(true);
                    break;

                case 'SEEK':
                    seekBoth(msg.time, true);
                    break;

                case 'RATE':
                    setSpeed(msg.rate, true);
                    break;

                case 'HEARTBEAT':
                    if (video2.src && !video2.paused) {
                        const diff = Math.abs(video2.currentTime - msg.time);
                        if (diff > 0.2) {
                            video2.currentTime = msg.time;
                        }
                    }
                    break;

                case 'MASTER_CLOSED':
                    showToast("Master tab was closed.");
                    break;
            }
        };

        if (secondaryRejoinBtn) {
            secondaryRejoinBtn.addEventListener('click', () => {
                syncChannel.postMessage({ type: 'REJOIN' });
                window.close();
            });
        }
        if (rejoinBtn) {
            rejoinBtn.addEventListener('click', () => {
                syncChannel.postMessage({ type: 'REJOIN' });
                window.close();
            });
        }

    } else {
        // TAB 1: MASTER / STANDALONE MODE
        splitTabsBtn.addEventListener('click', async () => {
            if (!stream2Data && !video2.src) {
                showToast("Please load a secondary stream before splitting!");
                return;
            }

            sessionId = `split_${Date.now()}`;
            syncChannel = new BroadcastChannel(`panopto_sync_${sessionId}`);

            body.classList.add('split-mode-master');
            if (rejoinBtn) rejoinBtn.classList.remove('hidden');

            // If local files, store in IndexedDB
            let hasFiles = (stream1Data && stream1Data.file) || (stream2Data && stream2Data.file);
            if (hasFiles) {
                await saveSessionToDB(sessionId, {
                    title: sessionHeading.textContent,
                    stream1: stream1Data,
                    stream2: stream2Data
                });
            }

            // Open Tab 2
            const secondaryUrl = chrome.runtime.getURL(`viewer.html?role=secondary&session=${sessionId}`);
            window.open(secondaryUrl, '_blank');

            // Send heartbeat every second to Tab 2
            if (syncHeartbeatInterval) clearInterval(syncHeartbeatInterval);
            syncHeartbeatInterval = setInterval(() => {
                if (syncChannel && video1.src) {
                    syncChannel.postMessage({
                        type: 'HEARTBEAT',
                        time: video1.currentTime,
                        isPlaying: !video1.paused
                    });
                }
            }, 1000);

            syncChannel.onmessage = (e) => {
                const msg = e.data;
                if (!msg) return;

                switch (msg.type) {
                    case 'SECONDARY_READY':
                        syncChannel.postMessage({
                            type: 'INIT_DATA',
                            title: sessionHeading.textContent,
                            stream2: stream2Data && stream2Data.url ? stream2Data : null,
                            localSessionId: hasFiles ? sessionId : null,
                            currentTime: video1.currentTime,
                            isPlaying: !video1.paused,
                            playbackRate: video1.playbackRate
                        });
                        break;

                    case 'PLAY':
                        seekBoth(msg.time, true);
                        playBoth(true);
                        break;

                    case 'PAUSE':
                        seekBoth(msg.time, true);
                        pauseBoth(true);
                        break;

                    case 'SEEK':
                        seekBoth(msg.time, true);
                        break;

                    case 'RATE':
                        setSpeed(msg.rate, true);
                        break;

                    case 'REJOIN':
                        mergeBackToSingleTab();
                        break;
                }
            };
        });

        function mergeBackToSingleTab() {
            body.classList.remove('split-mode-master');
            if (rejoinBtn) rejoinBtn.classList.add('hidden');
            if (syncHeartbeatInterval) clearInterval(syncHeartbeatInterval);
            setPreset(currentPreset);

            // Re-sync video 2
            if (video2.src && video1.src) {
                video2.currentTime = video1.currentTime;
                if (!video1.paused) video2.play();
            }
            showToast("Merged back into single window!");
        }

        rejoinBtn.addEventListener('click', mergeBackToSingleTab);
    }

    // ==========================================
    // Stream Loading & Dropzones
    // ==========================================

    function loadStream(index, streamObj) {
        if (!streamObj) return;

        let srcUrl = streamObj.url;
        if (streamObj.file) {
            srcUrl = URL.createObjectURL(streamObj.file);
        }

        if (index === 1) {
            stream1Data = streamObj;
            video1.src = srcUrl;
            dropEmpty1.classList.add('hidden');
            document.getElementById('streamTitle1').textContent = streamObj.title || 'Presenter / Camera';
            video1.load();
        } else if (index === 2) {
            stream2Data = streamObj;
            video2.src = srcUrl;
            dropEmpty2.classList.add('hidden');
            document.getElementById('streamTitle2').textContent = streamObj.title || 'Screen / Presentation';
            video2.load();
        }

        updateAudioRouting();
    }

    // Helper: Convert SRT text to WebVTT format
    function srtToVtt(srtText) {
        if (!srtText) return "";
        let clean = srtText.replace(/\r\n/g, '\n').trim();
        return "WEBVTT\n\n" + clean.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
    }

    // Attach Subtitle track to video
    function loadSubtitleFile(file) {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            const raw = e.target.result;
            const vtt = file.name.endsWith('.vtt') ? raw : srtToVtt(raw);
            const blob = new Blob([vtt], { type: 'text/vtt' });
            const url = URL.createObjectURL(blob);

            // Remove existing tracks on video1
            const oldTracks = video1.querySelectorAll('track');
            oldTracks.forEach(t => t.remove());

            const track = document.createElement('track');
            track.kind = 'subtitles';
            track.label = 'English Subtitles';
            track.srclang = 'en';
            track.src = url;
            track.default = true;
            video1.appendChild(track);

            if (video1.textTracks && video1.textTracks[0]) {
                video1.textTracks[0].mode = 'showing';
            }

            if (ccBtn) {
                ccBtn.classList.remove('hidden');
                ccBtn.classList.add('active');
            }
            showToast("Subtitles loaded successfully!");
        };
        reader.readAsText(file);
    }

    // Pair files automatically (MP4 videos and SRT subtitles)
    function handleMultipleFiles(files) {
        if (!files || files.length === 0) return;

        const fileList = Array.from(files);
        const videoFiles = [];
        const subtitleFiles = [];

        fileList.forEach(f => {
            const name = f.name.toLowerCase();
            if (name.endsWith('.srt') || name.endsWith('.vtt')) {
                subtitleFiles.push(f);
            } else if (f.type.startsWith('video/') || name.endsWith('.mp4') || name.endsWith('.webm') || name.endsWith('.m3u8')) {
                videoFiles.push(f);
            }
        });

        if (videoFiles.length === 0 && subtitleFiles.length > 0) {
            loadSubtitleFile(subtitleFiles[0]);
            return;
        }

        if (videoFiles.length === 0) {
            showToast("No MP4 or video files found in selection");
            return;
        }

        // Hide upload landing screen & modal
        if (uploadLandingView) uploadLandingView.classList.add('hidden');
        if (sourceModal) sourceModal.classList.add('hidden');

        // Check if only 1 video file was provided
        if (videoFiles.length === 1) {
            const vid = videoFiles[0];
            loadStream(1, { title: vid.name, file: vid });
            sessionHeading.textContent = vid.name.replace(/\.[^/.]+$/, "");

            // Single video mode: hide multi-screen layout controls
            setPreset('preset-single');
            if (presetsBar) presetsBar.style.display = 'none';
            if (splitTabsBtn) splitTabsBtn.style.display = 'none';
            if (swapBtn) swapBtn.style.display = 'none';
            if (splitDivider) splitDivider.style.display = 'none';
            if (container2) container2.style.display = 'none';

            showToast("Playing in Single Video Mode");
        } else {
            // 2 or more videos: multi-screen mode
            if (presetsBar) presetsBar.style.display = '';
            if (splitTabsBtn) splitTabsBtn.style.display = '';
            if (swapBtn) swapBtn.style.display = '';
            if (splitDivider) splitDivider.style.display = '';
            if (container2) container2.style.display = '';

            let cameraFile = null;
            let screenFile = null;

            videoFiles.forEach(f => {
                const name = f.name.toLowerCase();
                if (name.includes('presenter') || name.includes('camera') || name.includes('cam')) {
                    cameraFile = f;
                } else if (name.includes('screen') || name.includes('dv') || name.includes('slide')) {
                    screenFile = f;
                }
            });

            if (!cameraFile && videoFiles[0]) cameraFile = videoFiles[0];
            if (!screenFile && videoFiles[1]) screenFile = videoFiles[1];

            if (cameraFile) {
                loadStream(1, { title: cameraFile.name, file: cameraFile });
                sessionHeading.textContent = cameraFile.name.replace(/[-_]?(presenter|camera|screen).*/i, '');
            }
            if (screenFile) {
                loadStream(2, { title: screenFile.name, file: screenFile });
            }

            setPreset('preset-split-equal');
            showToast("Loaded both video feeds for Synchronized Dual View!");
        }

        // Auto load subtitles if included
        if (subtitleFiles.length > 0) {
            loadSubtitleFile(subtitleFiles[0]);
        }
    }

    // Drop on empty container 1
    // CC Subtitles toggle
    if (ccBtn) {
        ccBtn.addEventListener('click', () => {
            if (video1.textTracks && video1.textTracks[0]) {
                const track = video1.textTracks[0];
                const isShowing = track.mode === 'showing';
                track.mode = isShowing ? 'hidden' : 'showing';
                ccBtn.classList.toggle('active', !isShowing);
                showToast(!isShowing ? "Subtitles ON" : "Subtitles OFF");
            } else {
                showToast("No subtitles loaded");
            }
        });
    }

    // Landing screen controls
    if (landingDropzone) {
        landingDropzone.addEventListener('click', () => landingFileInput.click());
        landingFileInput.addEventListener('change', (e) => handleMultipleFiles(e.target.files));

        ['dragenter', 'dragover'].forEach(name => {
            landingDropzone.addEventListener(name, (e) => {
                e.preventDefault();
                landingDropzone.classList.add('drag-hover');
            });
        });
        ['dragleave', 'drop'].forEach(name => {
            landingDropzone.addEventListener(name, (e) => {
                e.preventDefault();
                landingDropzone.classList.remove('drag-hover');
            });
        });
        landingDropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            landingDropzone.classList.remove('drag-hover');
            if (e.dataTransfer && e.dataTransfer.files) {
                handleMultipleFiles(e.dataTransfer.files);
            }
        });
    }

    if (landingSelectBtn) {
        landingSelectBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            landingFileInput.click();
        });
    }

    if (landingUrlBtn) {
        landingUrlBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            sourceModal.classList.remove('hidden');
            const urlTabBtn = document.querySelector('.modal-tab-btn[data-tab="streamUrlsTab"]');
            if (urlTabBtn) urlTabBtn.click();
        });
    }

    // Item 4: Pressing anywhere on viewer stops / resumes video
    videoStage.addEventListener('click', (e) => {
        if (e.target.closest('button, input, select, .split-divider, .stream-audio-ctrl, .upload-landing-card, .modal-card, .stream-header-overlay')) {
            return;
        }
        if (isDraggingDivider) return;
        togglePlayPause();
    });

    dropEmpty1.addEventListener('click', () => fileInput1.click());
    fileInput1.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
            loadStream(1, { title: e.target.files[0].name, file: e.target.files[0] });
        }
    });

    // Drop on empty container 2
    dropEmpty2.addEventListener('click', () => fileInput2.click());
    fileInput2.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
            loadStream(2, { title: e.target.files[0].name, file: e.target.files[0] });
        }
    });

    // Batch files select
    batchSelectBtn.addEventListener('click', () => batchFileInput.click());
    batchFileInput.addEventListener('change', (e) => handleMultipleFiles(e.target.files));

    // Batch drag & drop
    ['dragenter', 'dragover'].forEach(eventName => {
        batchDropzone.addEventListener(eventName, (e) => {
            e.preventDefault();
            batchDropzone.classList.add('drag-hover');
        });
    });

    ['dragleave', 'drop'].forEach(eventName => {
        batchDropzone.addEventListener(eventName, (e) => {
            e.preventDefault();
            batchDropzone.classList.remove('drag-hover');
        });
    });

    batchDropzone.addEventListener('drop', (e) => {
        if (e.dataTransfer && e.dataTransfer.files) {
            handleMultipleFiles(e.dataTransfer.files);
        }
    });

    // Individual file pickers in modal
    individualFile1.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
            loadStream(1, { title: e.target.files[0].name, file: e.target.files[0] });
            sourceModal.classList.add('hidden');
        }
    });

    individualFile2.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
            loadStream(2, { title: e.target.files[0].name, file: e.target.files[0] });
            sourceModal.classList.add('hidden');
        }
    });

    // Load URLs
    loadUrlsBtn.addEventListener('click', () => {
        const u1 = urlInput1.value.trim();
        const u2 = urlInput2.value.trim();
        if (u1) loadStream(1, { title: 'Camera Stream', url: u1 });
        if (u2) loadStream(2, { title: 'Screen Stream', url: u2 });
        if (uploadLandingView) uploadLandingView.classList.add('hidden');
        if (u1 && !u2) {
            setPreset('preset-single');
            if (presetsBar) presetsBar.style.display = 'none';
            if (splitTabsBtn) splitTabsBtn.style.display = 'none';
            if (swapBtn) swapBtn.style.display = 'none';
            if (splitDivider) splitDivider.style.display = 'none';
            if (container2) container2.style.display = 'none';
        } else {
            if (presetsBar) presetsBar.style.display = '';
            if (splitTabsBtn) splitTabsBtn.style.display = '';
            if (swapBtn) swapBtn.style.display = '';
            if (splitDivider) splitDivider.style.display = '';
            if (container2) container2.style.display = '';
        }
        sourceModal.classList.add('hidden');
        showToast("Loaded remote stream URLs!");
    });

    // Modals
    sourceModalBtn.addEventListener('click', () => sourceModal.classList.remove('hidden'));
    closeSourceModalBtn.addEventListener('click', () => sourceModal.classList.add('hidden'));
    shortcutsBtn.addEventListener('click', () => shortcutsModal.classList.remove('hidden'));
    closeShortcutsModalBtn.addEventListener('click', () => shortcutsModal.classList.add('hidden'));

    [sourceModal, shortcutsModal].forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.add('hidden');
        });
    });

    // Tabs inside source modal
    const modalTabBtns = document.querySelectorAll('.modal-tab-btn');
    modalTabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            modalTabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const targetId = btn.dataset.tab;
            document.querySelectorAll('.modal-tab-pane').forEach(p => p.classList.remove('active'));
            document.getElementById(targetId).classList.add('active');
        });
    });

    // Buttons
    playPauseBtn.addEventListener('click', togglePlayPause);
    rewindBtn.addEventListener('click', () => seekBoth(getMasterTime() - 10));
    forwardBtn.addEventListener('click', () => seekBoth(getMasterTime() + 10));

    // ==========================================
    // Keyboard Hotkeys
    // ==========================================
    window.addEventListener('keydown', (e) => {
        // Ignore if user is typing in an input
        if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;

        switch (e.code) {
            case 'Space':
                e.preventDefault();
                togglePlayPause();
                break;
            case 'ArrowLeft':
                e.preventDefault();
                seekBoth(getMasterTime() - (e.shiftKey ? 15 : 5));
                break;
            case 'ArrowRight':
                e.preventDefault();
                seekBoth(getMasterTime() + (e.shiftKey ? 15 : 5));
                break;
            case 'ArrowUp':
                e.preventDefault();
                masterVolSlider.value = Math.min(1, parseFloat(masterVolSlider.value) + 0.1);
                updateAudioRouting();
                break;
            case 'ArrowDown':
                e.preventDefault();
                masterVolSlider.value = Math.max(0, parseFloat(masterVolSlider.value) - 0.1);
                updateAudioRouting();
                break;
            case 'KeyM':
                masterMuteBtn.click();
                break;
            case 'KeyS':
                swapBtn.click();
                break;
            case 'KeyC':
                if (ccBtn) ccBtn.click();
                break;
            case 'KeyF':
                fullscreenBtn.click();
                break;
            case 'KeyT':
                splitTabsBtn.click();
                break;
            case 'Digit1':
                setPreset('preset-split-equal');
                break;
            case 'Digit2':
                setPreset('preset-focus-screen');
                break;
            case 'Digit3':
                setPreset('preset-focus-presenter');
                break;
            case 'Digit4':
                setPreset('preset-pip');
                break;
            case 'Digit5':
                setPreset('preset-stacked');
                break;
            case 'Digit6':
                setPreset('preset-single');
                break;
            case 'Escape':
                sourceModal.classList.add('hidden');
                shortcutsModal.classList.add('hidden');
                break;
        }
    });

    // Check if opened from extension with session data
    if (!isSecondaryTab) {
        chrome.storage.local.get(['viewerSession'], (res) => {
            if (res && res.viewerSession) {
                const s = res.viewerSession;
                if (s.title) sessionHeading.textContent = s.title;

                                if (uploadLandingView) uploadLandingView.classList.add('hidden');
                const primary = s.streams.find(st => st.type === 'primary');
                const secondary = s.streams.find(st => st.type === 'secondary');
                const podcast = s.streams.find(st => st.type === 'podcast');

                if (primary && secondary) {
                    loadStream(1, primary);
                    loadStream(2, secondary);
                } else if (podcast && secondary) {
                    loadStream(1, podcast);
                    loadStream(2, secondary);
                } else if (s.streams[0] && s.streams[1]) {
                    loadStream(1, s.streams[0]);
                    loadStream(2, s.streams[1]);
                } else if (s.streams[0]) {
                    loadStream(1, s.streams[0]);
                    setPreset('preset-single');
                    if (presetsBar) presetsBar.style.display = 'none';
                    if (splitTabsBtn) splitTabsBtn.style.display = 'none';
                    if (swapBtn) swapBtn.style.display = 'none';
                    if (splitDivider) splitDivider.style.display = 'none';
                    if (container2) container2.style.display = 'none';
                }

                showToast(`Loaded lecture: ${s.title || "Panopto recording"}`);
                // Clear session from storage so next time viewer opens blank if desired
                chrome.storage.local.remove(['viewerSession']);
            }
        });
    }

});
