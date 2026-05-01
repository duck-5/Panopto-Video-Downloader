# Panopto Video Downloader System Documentation

This document describes the structure, flows, and methods used in the Panopto Video Downloader Chrome Extension.

## 1. Project Structure

The project is a standard Google Chrome extension built with Javascript and HTML.

### Core Files
* **`manifest.json`**: The configuration file that defines the extension's metadata (Manifest V3), permissions (`activeTab`, `scripting`), and service worker.
* **`background.js`**: The service worker script that listens for extension icon clicks, manages browser tabs, and dynamically injects the payload script to handle file download operations.
* **`payload.js`**: The script that is programmatically injected into the active Panopto web page to interact with the DOM and extract video metadata.
* **`README.md`**: Contains information about the project, installation, and usage instructions.

### Assets
* **`icon16.png`, `icon48.png`, `icon128.png`**: The application icons used in the Chrome Web Store and browser toolbar.
* **`download-icon-green.png`**: The default icon displayed for the browser action.

---

## 2. System Flow

The system operates based on user interaction with the extension icon when a valid Panopto page is active.

### Trigger Flow (Service Worker)
1. **User Action:** The user clicks the extension icon in the Chrome toolbar.
2. **URL Validation:** The `background.js` service worker reads the URL of the active tab directly from the event. It checks if the URL hostname ends with `"panopto.com"` or `"panopto.eu"`.
3. **URL Redirection (if necessary):** If the URL contains `"Embed.aspx"`, the script replaces it with `"/Viewer.aspx"` and triggers a tab update. Due to the redirect, the user must wait for the page to load and click the extension again.
4. **Script Injection:** If the URL is valid, `background.js` programmatically injects the `payload.js` script into the active tab using `chrome.scripting.executeScript`.

### Data Extraction Flow (Injected Script)
1. **Script Execution:** `payload.js` executes immediately upon injection.
2. **Metadata Parsing:** The script searches the page's DOM for `<meta>` tags.
    * **Video URL:** Looks for a `<meta>` tag with `name="twitter:player:stream"`. It extracts the `content` attribute and splits it by `?` to remove any query parameters.
    * **Video Title:** Looks for a `<meta>` tag with `property="og:title"`. It extracts the `content` attribute to use as the file name.
3. **String Sanitization:** The extracted title string is sanitized using a regular expression to ensure it is a valid filename by replacing slashes (`/`), spaces (` `), and colons (`:`) with underscores. The `.mp4` extension is appended.
4. **Result Return:** An object containing the extracted URL and filename is synchronously returned to the service worker.

### Download Execution Flow (Service Worker)
1. **Result Reception:** The `background.js` script awaits the injection results and receives the video data.
2. **Download API Invocation:** It invokes the `chrome.downloads.download` API with the provided URL and filename, setting `saveAs: true` so the user is prompted to choose a download location.

---

## 3. Key Methods and APIs Used

### Chrome Extension APIs
* `chrome.action.onClicked.addListener()`: Listens for clicks on the extension's toolbar icon (Manifest V3).
* `chrome.scripting.executeScript()`: Programmatically injects and runs a script in the active tab.
* `chrome.tabs.update()`: Updates the URL of the current tab (used to redirect from Embed to Viewer).
* `chrome.downloads.download()`: Triggers the browser's download manager.

### DOM Manipulation & Javascript Methods
* `document.getElementsByTagName('meta')`: Scans the HTML head for metadata tags containing video information.
* `getAttribute("name")` / `getAttribute("content")`: Retrieves specific values from the `<meta>` tags.
* `URL` Object: Used for secure and accurate URL parsing and host validation.
* `String.prototype.replace()`: Used to swap `Embed.aspx` with `Viewer.aspx` and sanitize strings via Regex.
