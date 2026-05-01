# Security and Privacy Audit Report

This document outlines the security, privacy, and architectural issues found in the Panopto Video Downloader extension.

## 1. Privacy Issues & Permissions

* **Minimal Permissions Used Properly:** The extension currently uses `"activeTab"` instead of the broader `"tabs"` permission. This is a good privacy practice, as `"tabs"` would trigger a warning about accessing browsing history, while `"activeTab"` only grants temporary access to the current tab when the user clicks the extension icon. It does not actually access your general browsing history.
* **Content Script Scope:** The `manifest.json` correctly scopes the content script injection to only match `*://*.panopto.eu/*` and `*://*.panopto.com/*`, preventing the script from running indiscriminately across all websites.

## 2. Security Vulnerabilities

### A. Flawed URL Validation in `background.js`
The extension checks if it's on a Panopto site using this logic:
```javascript
if(tabs[0].url.indexOf("panopto.com") > 1 || tabs[0].url.indexOf("panopto.eu") > 1)
```
**Issue:** This string matching is highly insecure. It will return true for any URL containing that string anywhere, such as:
* `https://malicious-website.com/?q=panopto.com`
* `https://google.com/search?q=panopto.eu`

**Risk:** The extension will attempt to run its logic (like replacing `Embed.aspx` with `Viewer.aspx` and refreshing the page) on unintended websites. An attacker could potentially craft a link that forces the extension to redirect the user or interact unpredictably.
**Recommendation:** Use the `URL` object to strictly verify the `hostname` property instead of relying on `indexOf`.

### B. Incomplete Filename Sanitization
In `payload.js`, the filename is "sanitized" before downloading:
```javascript
name = name.split('/').join('_');
name = name.split(' ').join('_');
name = name.split(':').join('-');
```
**Issue:** This only accounts for slashes, spaces, and colons. It misses many illegal characters across different operating systems (e.g., `\`, `*`, `?`, `"`, `<`, `>`, `|`) and does not protect against potential directory traversal attempts (e.g., using `..` if it weren't for the slash replacement).
**Risk:** While Chrome's `downloads.download` API generally provides a safety net against directory traversal, relying on incomplete client-side sanitization can result in failed downloads or unexpected file system behavior on edge cases.
**Recommendation:** Use a comprehensive Regex to strip all non-alphanumeric/safe characters.

## 3. Architecture & Code Quality Issues

### A. Deprecated Manifest Version (Manifest V2)
The extension uses `"manifest_version": 2`.
**Issue:** Google has deprecated Manifest V2. Manifest V3 introduces stricter security boundaries (like prohibiting remotely hosted code and replacing background pages with service workers).
**Risk:** The extension is considered legacy and will eventually be disabled by modern Chromium-based browsers, making it unusable and falling short of modern extension security standards.

### B. Listener Memory Leak
In `background.js`:
```javascript
chrome.tabs.onUpdated.addListener(function listener (tabId, info) {
    if (info.status === 'complete' && tabId === tabs[0].id) {
        chrome.tabs.onUpdated.removeListener(listener);
        // ...
    }
});
```
**Issue:** A new listener is created *every time* the extension icon is clicked and the URL contains `Embed.aspx`. If the tab update never completes (e.g., network failure, user closes tab), the listener is never removed.
**Risk:** Over time, these zombie listeners accumulate, causing a memory leak and potentially executing the download callback multiple times unexpectedly if a tab ID is reused.

---
**Summary:** While the extension doesn't actively steal data or snoop on browsing history, its URL validation and filename sanitization need significant improvement to prevent edge-case exploits. Furthermore, it must be migrated to Manifest V3 to meet current Chrome Web Store security requirements.
