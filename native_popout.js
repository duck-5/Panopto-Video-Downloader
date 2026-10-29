/**
 * Panopto Native In-Page Pop-Out Controller
 * Enables popping out Panopto camera or screen video streams into
 * native Picture-in-Picture windows without downloading.
 */

(() => {
    // Prevent duplicate injection
    if (window.__panoptoNativePopoutInitialized) {
        if (typeof window.__panoptoInjectButtons === 'function') {
            window.__panoptoInjectButtons();
        }
        if (typeof window.__panoptoToggleTarget === 'function') {
            return window.__panoptoToggleTarget;
        }
        return;
    }
    window.__panoptoNativePopoutInitialized = true;

    // Helper: Find video streams in Panopto's DOM
    function getPanoptoVideos() {
        const videos = Array.from(document.querySelectorAll('video'));
        if (videos.length === 0) return { primary: null, secondary: null, all: [] };

        let primary = null;
        let secondary = null;

        // 1. Check by ID or class
        for (const v of videos) {
            const id = (v.id || '').toLowerCase();
            const cls = (v.className || '').toLowerCase();
            const parentId = (v.parentElement ? v.parentElement.id : '').toLowerCase();

            if (id.includes('secondary') || cls.includes('secondary') || parentId.includes('secondary')) {
                secondary = v;
            } else if (id.includes('primary') || cls.includes('primary') || parentId.includes('primary')) {
                primary = v;
            }
        }

        // 2. If ambiguous and we have at least 2 videos, classify by resolution or layout area
        if (videos.length >= 2) {
            if (!secondary || !primary) {
                const r0 = videos[0].getBoundingClientRect();
                const r1 = videos[1].getBoundingClientRect();
                const area0 = (videos[0].videoWidth || r0.width) * (videos[0].videoHeight || r0.height);
                const area1 = (videos[1].videoWidth || r1.width) * (videos[1].videoHeight || r1.height);

                // Typically the presentation / screen share has the larger area or resolution
                if (area1 >= area0) {
                    secondary = videos[1];
                    primary = videos[0];
                } else {
                    secondary = videos[0];
                    primary = videos[1];
                }
            }
        } else if (videos.length === 1) {
            primary = videos[0];
            secondary = videos[0];
        }

        return { primary, secondary, all: videos };
    }

    // Toggle Picture-in-Picture on target video
    async function togglePopout(target = 'secondary') {
        const { primary, secondary, all } = getPanoptoVideos();
        const targetVideo = (target === 'primary') ? primary : (secondary || primary || all[0]);

        if (!targetVideo) {
            alert("No active video feed found on this Panopto page. Start video playback and try again.");
            return { success: false, error: "No video found" };
        }

        try {
            if (document.pictureInPictureElement) {
                if (document.pictureInPictureElement === targetVideo) {
                    await document.exitPictureInPicture();
                    return { success: true, state: 'exited' };
                } else {
                    // Switch to this video
                    await document.exitPictureInPicture();
                    await targetVideo.requestPictureInPicture();
                    return { success: true, state: 'entered', target };
                }
            } else {
                await targetVideo.requestPictureInPicture();
                return { success: true, state: 'entered', target };
            }
        } catch (err) {
            console.warn("Panopto Native Pop-Out PiP request:", err);
            return { success: false, error: err.message };
        }
    }

    window.__panoptoToggleTarget = togglePopout;
    window.__panoptoInjectButtons = injectFloatingOverlayButtons;

    // Inject discreet floating buttons on the video player
    function injectFloatingOverlayButtons() {


        const { primary, secondary } = getPanoptoVideos();
        if (!primary && !secondary) return;

        // Container styles
        if (!document.getElementById('panopto-popout-styles')) {
            const style = document.createElement('style');
        style.id = 'panopto-popout-styles';
        style.textContent = `
            .panopto-popout-btn-overlay {
                position: absolute;
                top: 14px;
                right: 14px;
                z-index: 2147483647;
                background: rgba(15, 23, 42, 0.88);
                backdrop-filter: blur(8px);
                border: 1px solid rgba(255, 255, 255, 0.2);
                border-radius: 20px;
                color: #ffffff;
                padding: 6px 12px;
                font-size: 11px;
                font-weight: 600;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 6px;
                box-shadow: 0 4px 14px rgba(0, 0, 0, 0.4);
                transition: all 0.2s ease;
                opacity: 0.85;
            }
            .panopto-popout-btn-overlay:hover {
                opacity: 1;
                background: rgba(16, 185, 129, 0.95);
                border-color: #10b981;
                transform: translateY(-1px);
                box-shadow: 0 6px 18px rgba(16, 185, 129, 0.4);
            }
            .panopto-popout-btn-overlay.active {
                background: #10b981;
                border-color: #34d399;
                opacity: 1;
            }
            .panopto-popout-btn-overlay svg {
                width: 14px;
                height: 14px;
            }
        `;
        document.head.appendChild(style);
        }

        function attachButtonToVideo(video, label, type) {
            if (!video || !video.parentElement) return;

            // Ensure parent allows absolute positioning
            const parent = video.parentElement;
            if (parent.querySelector(`.popout-btn-${type}`)) return;
            const parentPos = window.getComputedStyle(parent).position;
            if (parentPos === 'static') {
                parent.style.position = 'relative';
            }

            const btn = document.createElement('button');
            btn.className = `panopto-popout-btn-overlay popout-btn-${type}`;
            btn.title = `Pop out ${label} to separate floating window / 2nd monitor`;
            btn.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
                <span>Pop Out ${label}</span>
            `;

            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                e.preventDefault();
                await togglePopout(type);
            });

            // Update button state on PiP events
            video.addEventListener('enterpictureinpicture', () => {
                btn.classList.add('active');
                btn.innerHTML = `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="4 14 10 14 10 20"></polyline>
                        <polyline points="20 10 14 10 14 4"></polyline>
                        <line x1="14" y1="10" x2="21" y2="3"></line>
                        <line x1="3" y1="21" x2="10" y2="14"></line>
                    </svg>
                    <span>Rejoin ${label}</span>
                `;
            });

            video.addEventListener('leavepictureinpicture', () => {
                btn.classList.remove('active');
                btn.innerHTML = `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                    <span>Pop Out ${label}</span>
                `;
            });

            parent.appendChild(btn);
        }

        // Attach Pop Out to secondary screen (and primary if different)
        if (secondary) {
            attachButtonToVideo(secondary, "Screen", "secondary");
        }
        if (primary && primary !== secondary) {
            attachButtonToVideo(primary, "Camera", "primary");
        }
    }

    // Auto-inject buttons when loaded
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        injectFloatingOverlayButtons();
    } else {
        document.addEventListener('DOMContentLoaded', injectFloatingOverlayButtons);
    }

    // Re-check after 1.5 seconds if video elements loaded dynamically
    setTimeout(injectFloatingOverlayButtons, 1500);

    // Dynamic observer: automatically attaches buttons when video elements render
    try {
        const observer = new MutationObserver(() => {
            const hasBtns = document.querySelector('.panopto-popout-btn-overlay');
            const hasVideos = document.querySelector('video');
            if (hasVideos && !hasBtns) {
                injectFloatingOverlayButtons();
            }
        });
        observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
    } catch(e) {}

})();
