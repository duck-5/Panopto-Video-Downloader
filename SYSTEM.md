# Panopto Video Downloader System Documentation

This document describes the structure, flows, and methods used in the Panopto Video Downloader Chrome Extension, including multi-screen stream extraction, separate downloading, and the Smart Dual-Screen Viewer.

## 1. Project Structure

The project is a standard Google Chrome extension built with Javascript and HTML (Manifest V3).

### Core Files
* **`manifest.json`**: The configuration file that defines the extension's metadata (Manifest V3), permissions (`activeTab`, `downloads`, `scripting`, `storage`), service worker, and browser action popup.
* **`background.js`**: Service worker script that manages message passing, concurrent and individual stream downloads via `chrome.downloads`, and tab redirection.
* **`payload.js`**: The script programmatically injected into the active Panopto web page (`MAIN` world) to interact with the DOM and Panopto internals to extract all primary, secondary (screen/slides), and combined podcast streams.
* **`popup.html` / `popup.js` / `popup.css`**: The extension toolbar popup UI that scans the active tab, displays all detected video feeds with format badges, allows individual or batch downloading, and provides a 1-click launcher for the Smart Viewer.
* **`viewer.html` / `viewer.js` / `viewer.css`**: The Smart Dual-Screen Viewer application. Plays multiple streams synchronously (both remote URLs and local `.mp4` video files), supports layout presets, resizable dividers, audio routing, and multi-tab splitting across multiple monitors.
* **`README.md`**: Contains overview, installation, usage, and license instructions.

### Assets
* **`icon16.png`, `icon48.png`, `icon128.png`**: Application icons.
* **`icon.png`**: Default icon displayed for the browser action.

---

## 2. System Flow

The system operates based on user interaction with the extension icon when viewing a Panopto lecture or offline.

### Trigger & Inspection Flow (Popup & Injected Payload)
1. **User Action:** The user clicks the extension icon in the Chrome toolbar.
2. **Page Detection:** `popup.js` inspects the active tab URL.
   * If on `/Embed.aspx`, displays an alert banner allowing 1-click redirection to `/Viewer.aspx`.
   * If not on a Panopto domain, displays a screen with a direct button to launch the Offline Smart Viewer.
3. **Payload Injection:** On a Panopto page, `popup.js` executes `payload.js` in the `MAIN` execution world.
4. **Multi-Stream Extraction Strategy:**
   * **Step 1: Title Sanitization:** Extracts session title from `<meta property="og:title">`, `document.title`, or `SessionName`.
   * **Step 2: Delivery Streams Parsing:** Reads `viewerData.Delivery.Streams`, `viewerState.delivery.streams`, or `Panopto.viewer.delivery.Streams`. Categorizes feeds:
     * Primary Stream (Presenter / Camera): `StreamType === 1` or Tag containing `Presenter`/`AudioVideo`.
     * Secondary Stream(s) (Screen / Slides / Document Camera): `StreamType === 2` or Tag `DV`/`Screen`.
     * Combined Stream: `Delivery.PodcastStream.StreamUrl`.
   * **Step 3: Authenticated DeliveryInfo API:** If globals are minified or incomplete, issues an authenticated POST request to `/Panopto/Pages/Viewer/DeliveryInfo.aspx` with session ID to extract full `Delivery.Streams` and `PodcastUrl`.
   * **Step 4: Legacy Meta Tags & Brute-force Endpoints:** Fallbacks for `/Panopto/Podcast/Download/{deliveryId}.mp4`.
   * **Step 5: Resource Interception & DOM Regex:** Captures active media URLs from `window.performance.getEntriesByType("resource")` and regex scans.
5. **UI Rendering:** Returns a structured list of streams. The popup renders stream cards with format badges, individual download buttons, a "Download All Screens" button, and a "Watch in Smart Dual Viewer" button.

### Multi-Stream Download Execution Flow
1. **Individual Stream Download:** User clicks "Download" on any stream card. `background.js` triggers `chrome.downloads.download` with suggested filename (e.g. `[Lecture] - Presenter.mp4` or `[Lecture] - Screen.mp4`).
2. **Download All Screens:** Downloads all camera and screen feeds in one click with staggered download calls to prevent browser throttling.

---

## 3. Smart Dual-Screen Viewer Architecture

The Smart Viewer (`viewer.html`) replicates and enhances the Panopto viewing experience offline or online.

### 1. Dual Playback & Sync Engine
* Houses two `<video>` instances: Stream 1 (Camera) and Stream 2 (Screen).
* **Unified Master Controls:** Play, pause, seek, and playback rates (0.5x - 2.5x) are executed synchronously on both videos.
* **Continuous Drift Correction:** Runs every 400ms. If playback timestamps between Stream 1 and Stream 2 differ by more than 0.15s, Stream 2 is smoothly aligned to eliminate echo and slide lag.

### 2. Layout Presets & Interactive Divider
* **50 / 50 Equal Split**: Side-by-side equal width.
* **Screen Focus (75 / 25)**: Shared screen takes 75% width, camera takes 25%.
* **Presenter Focus (25 / 75)**: Camera takes 75% width, screen takes 25%.
* **Picture-in-Picture (PiP)**: Full-size screen with floating, movable camera overlay.
* **Stacked (Top / Bottom)**: Stacked vertically, ideal for vertical or portrait monitors.
* **Single Focus**: Focuses on a single video full-size; press <kbd>S</kbd> to instantaneously swap feeds.
* **Custom Resizing:** Interactive divider bar can be dragged horizontally or vertically to set custom width/height ratios.

### 3. Multi-Tab Split Mode (Feature 2.1)
Allows moving one screen to a secondary browser tab or separate monitor while maintaining full synchronization:
* **Protocol:** Uses Chromium's native `BroadcastChannel` API (`panopto_sync_{sessionId}`).
* **Master Tab (Tab 1):** Plays Stream 1 full-screen. Emits `PLAY`, `PAUSE`, `SEEK`, `RATE`, and periodic `HEARTBEAT` sync packets.
* **Secondary Tab (Tab 2):** Opened via `window.open`. Plays Stream 2 full-screen on any monitor. Responds to master commands and broadcasts user inputs back to Tab 1.
* **Local Video Sharing via IndexedDB:** When local files are loaded, video Blobs are stored in IndexedDB under the session ID, allowing Tab 2 to play the secondary video directly without re-uploading.
* **Automatic Rejoin:** Closing Tab 2 or clicking "Merge back to Single Tab" re-attaches both feeds into the master window seamlessly.

---

## 4. Key APIs and Methods Used

* `chrome.scripting.executeScript()` with `world: 'MAIN'`
* `chrome.downloads.download()`
* `chrome.storage.local`
* `BroadcastChannel` (Inter-tab communication for multi-monitor playback)
* `IndexedDB` (Binary file sharing between extension tabs)
* HTML5 Media APIs (`play()`, `pause()`, `currentTime`, `playbackRate`, `buffered`)
