# Panopto Tools (Downloader & more!)

A powerful Google Chrome extension that downloads multi-screen lectures from Panopto (including separate camera and screen shares) and provides a Smart Dual-Screen Viewer to watch them synchronously in multiple layouts or split across multiple monitors.

---

## 🚀 Key Features

### 1. Multi-Screen Views & Separate Downloads
Panopto recordings frequently contain multiple distinct video feeds:
* **Presenter Video (Camera)**: The lecturer or lecture hall webcam.
* **Screen / Presentation (Shared Screen / Slides)**: The slides, tablet notes, or display feed.
* **Combined View (Podcast)**: The pre-rendered composite video.

With this extension, you can:
* **Detect all available screens** automatically on any Panopto lecture.
* **Download screens separately** with clean, organized filenames (`[Lecture] - Presenter.mp4`, `[Lecture] - Screen.mp4`).
* **Download All Screens** in one click.
* **Direct stream links**: Quickly copy direct media links for external tools (e.g. VLC or ffmpeg).

---

### 2. Smart Dual-Screen Viewer
Watch your downloaded Panopto videos or remote streams synchronously in a full-featured video player designed to replicate and improve upon the native Panopto viewer.

* **Simultaneous Playback & Scrubbing**: Play, pause, seek, and adjust speeds (0.5x - 2.5x) across both screens simultaneously.
* **Automatic Drift Correction**: Continuously realigns playback within 0.15s so audio and slides never drift apart.
* **Multiple Layout Presets**:
  * **50 / 50 Equal Split**: Side-by-side equal view.
  * **Screen Focus (75 / 25)**: Enlarged screen feed with compact presenter video.
  * **Presenter Focus (25 / 75)**: Enlarged presenter video with compact screen.
  * **Picture-in-Picture (PiP)**: Fullscreen presentation with floating camera overlay.
  * **Stacked (Top / Bottom)**: Ideal for portrait / vertical monitors.
  * **Single Focus**: Focus on one video full-size; press <kbd>S</kbd> to swap feeds.
* **Draggable Split Divider**: Drag the divider bar to customize the width ratio between both screens dynamically.
* **Intelligent Audio Routing**: Choose between Camera audio, Screen audio, or both, with individual and master volume sliders.
* **Local File Support**: Drag and drop your downloaded video files; the viewer automatically detects which is the camera and which is the screen based on filename!

---

### 2.1. Multi-Monitor Split Tab Mode (Split into 2 Separate Tabs)
Have dual monitors? You can split the viewer into two separate browser tabs:
* Click **"Split to 2 Tabs"** in the top navigation bar.
* **Tab 1** displays the Presenter video full-screen.
* **Tab 2** opens in a new tab displaying the Screen video full-screen. Move Tab 2 to your second monitor!
* **Zero-Latency Sync**: Both tabs communicate over a secure browser `BroadcastChannel`. Pressing Space, seeking, or changing speed in *either* tab synchronizes both tabs in real-time.
* **Local Video Sharing**: Local files are seamlessly shared between tabs via `IndexedDB`, requiring no re-uploading.
* **1-Click Merge**: Close Tab 2 or click "Merge back into Single Tab" to return to single-window mode without losing your playback position.

---

### 3. Live In-Page Pop-Out (Without Downloading)
If you prefer staying directly inside the original Panopto viewer page:
* **Floating In-Page Buttons**: Opening the extension automatically mounts discreet glassmorphism `[ ⧉ Pop Out Screen ]` and `[ ⧉ Pop Out Camera ]` buttons directly onto the Panopto player.
* **1-Click Floating OS Window**: Pops the screen share out into a native Picture-in-Picture window that can be dragged to your second monitor.
* **Zero Downloads & 100% Native Sync**: All of Panopto's native features—timeline scrubbing, play/pause, speed controls, transcripts, and notes—remain fully active and synchronized.
* **From Popup**: You can also click **"Pop Out Screen"** or **"Pop Out Camera"** directly in the extension popup menu.

---

## ⌨️ Keyboard Shortcuts (Smart Viewer)

| Shortcut | Action |
| :--- | :--- |
| <kbd>Space</kbd> | Play / Pause both screens |
| <kbd>←</kbd> / <kbd>→</kbd> | Seek backward / forward 5 seconds |
| <kbd>Shift</kbd> + <kbd>←</kbd> / <kbd>→</kbd> | Seek backward / forward 15 seconds |
| <kbd>↑</kbd> / <kbd>↓</kbd> | Increase / decrease master volume |
| <kbd>M</kbd> | Master Mute / Unmute |
| <kbd>S</kbd> | Swap screen feeds |
| <kbd>1</kbd> - <kbd>6</kbd> | Switch layout presets |
| <kbd>T</kbd> | Split to 2 Tabs (Multi-Monitor Mode) |
| <kbd>F</kbd> | Toggle Fullscreen |
| <kbd>?</kbd> | View keyboard shortcuts |

---

## 📦 How to Install

1. Clone or download this repository:
   ```bash
   git clone https://github.com/ManoloZocco/Panopto-Video-Downloader.git
   ```
2. Open Google Chrome or Microsoft Edge and navigate to `chrome://extensions/`.
3. Enable **Developer mode** (toggle switch in the top-right corner).
4. Click **Load unpacked** and select the folder containing this extension.

---

## 💡 How to Use

1. Navigate to the Panopto recording you wish to download (on `panopto.com` or `panopto.eu`).
2. Click the green extension icon in your browser toolbar.
3. The popup will display all detected video feeds (Presenter, Screen, Combined).
4. Click **Download** on individual streams or click **Download All Screens**.
5. Or, click **Watch in Smart Dual Viewer** to start playing both screens synchronously immediately.
6. To watch downloaded files offline, click the extension icon anytime and select **Open Offline Smart Viewer**.

---

## 📜 Disclaimer & Terms of Use

This extension is provided as an **experimental tool** for personal use only. 

By using this product, you agree that your usage must strictly comply with the academic, copyright, and privacy policies set forth by your university, campus, or institution, as well as Panopto's Terms of Service.

The developer assumes no responsibility or liability for how this tool is used. You are solely responsible for ensuring that you have the appropriate rights, permissions, and consent to download and store any video content.

Released under GNU General Public License 3.0.
