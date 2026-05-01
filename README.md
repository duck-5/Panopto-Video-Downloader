# Panopto Video Downloader
A simple extension for Google Chrome that allows you to download videos from Panopto for later viewing.

## History & Fork Information
This project is a fork of the original Panopto Video Downloader by [ManoloZocco](https://github.com/ManoloZocco/Panopto-Video-Downloader). 

Since the fork, this extension has undergone a massive architecture overhaul to ensure modern browser compatibility and universal Panopto support.

### Major Changes & Improvements Since Fork:
* **Manifest V3 Upgrade**: The extension was completely migrated from the deprecated Manifest V2 to Manifest V3, ensuring long-term support in Google Chrome.
* **Service Worker Architecture**: Replaced the persistent background script with a modern, event-driven Service Worker, resolving memory leaks and improving performance.
* **Privacy by Default**: Removed the overbroad `"content_scripts"` permissions that read every Panopto page automatically. The extension now relies strictly on `"activeTab"`, meaning it only accesses the page data when you explicitly click the extension icon.
* **Robust 7-Step Extraction Engine**: The original extension relied on a single `<meta>` tag (which Panopto has removed on many sites). The new extraction engine guarantees downloads by falling back through 7 strategies:
  1. **Title extraction** via comprehensive regex sanitization.
  2. **Global Variable Reading**: Directly reads Panopto's internal Javascript objects (`viewerData`, `viewerState`).
  3. **Legacy `<meta>` tag** parsing.
  4. **API Brute-forcing**: Issues authenticated `HEAD` requests to known Panopto Podcast endpoints.
  5. **DeliveryInfo API**: Fetches and parses the authenticated `/DeliveryInfo.aspx` JSON payload.
  6. **Network Interception**: Reads the browser's internal performance logs to capture the active `.mp4` or `.m3u8` stream.
  7. **Regex DOM Scraper**: A final brute-force scan of the page's raw HTML for media URLs.
* **Content Security Policy (CSP) Compliance**: Refactored the payload script to execute natively in the `MAIN` world using `chrome.scripting`, bypassing strict university CSPs that block inline script injections.
* **Security Hardening**: Replaced insecure string manipulation for URL checks with robust `URL` object parsing, preventing malicious domains from spoofing the extension.

---

# How to install:
Add it to Chrome or EDGE (based on Chromium) from Chrome Web Store: https://chrome.google.com/webstore/detail/panopto-video-downloader/fldiimnkhimjonkiklkchogonpidmmca?hl=it

Or download the code and install it in your browser following these instructions: https://github.com/ManoloZocco/Panopto-Video-Downloader/wiki/How-to-install

# How to use:
Navigate to the Panopto video itself you want to download, Click on the extension icon (it's green and located at the top right of your browser) and choose where you want the video to be saved.

NOTE:
Feel free to comment if you have problems using it, or if it stops working.
Feel free to propose changes and improvements: as mentioned above, I am not a professional programmer :)
You can propose changes to me or use the code to create an improved version.

Based on downloadPanopto by dfaour: https://github.com/dfaour/downloadPanopto

Released under GNU General License 3.0.

## Disclaimer & Terms of Use

This extension is provided as an **experimental tool** for personal use only. 

By using this product, you agree that your usage must strictly comply with the academic, copyright, and privacy policies set forth by your university, campus, or institution, as well as Panopto's Terms of Service.

**The developer assumes no responsibility or liability** for how this tool is used. You are solely responsible for ensuring that you have the appropriate rights, permissions, and consent to download and store any video content. This tool must **not** be used to illegally distribute, share, or monetize copyrighted lecture recordings, course materials, or any other intellectual property without explicit authorization from the content owner. 

Use this tool at your own risk.
