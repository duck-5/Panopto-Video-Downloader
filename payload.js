(async () => {
    const sanitize = (raw) => {
        if (!raw) return "video";
        return raw.replace(/[<>:"\/\\|?*\x00-\x1F]/g, '_').trim().slice(0, 120) || "video";
    };

    const makeAbsolute = (url) => {
        if (!url) return "";
        let clean = url.replace(/\\\//g, '/').replace(/\\u0026/g, '&');
        if (clean.startsWith('/')) {
            clean = window.location.origin + clean;
        }
        return clean;
    };

    // 1. Extract Session Title
    let sessionTitle = "video";
    const titleMeta = document.querySelector('meta[property="og:title"]');
    if (titleMeta && titleMeta.content) {
        sessionTitle = titleMeta.content.split('?')[0].trim();
    } else if (document.title) {
        sessionTitle = document.title.replace(/\s*-\s*Panopto.*$/i, '').trim() || document.title.trim();
    }
    const baseName = sanitize(sessionTitle);

    const urlParams = new URLSearchParams(window.location.search);
    const deliveryId = urlParams.get('id');

    // Data containers
    let rawStreams = [];
    let podcastUrl = "";
    let detectedTitle = "";

    // 2. Try Global Javascript Variables
    try {
        const globalObjects = [
            typeof viewerData !== 'undefined' ? viewerData : null,
            typeof viewerState !== 'undefined' ? viewerState : null,
            (typeof Panopto !== 'undefined' && Panopto.viewer) ? Panopto.viewer : null
        ];

        for (const obj of globalObjects) {
            if (!obj) continue;
            const delivery = obj.Delivery || obj.delivery;
            if (delivery) {
                if (delivery.SessionName || delivery.sessionName) {
                    detectedTitle = delivery.SessionName || delivery.sessionName;
                }
                if (delivery.PodcastStream && delivery.PodcastStream.StreamUrl) {
                    podcastUrl = delivery.PodcastStream.StreamUrl;
                } else if (delivery.podcastStream && delivery.podcastStream.streamUrl) {
                    podcastUrl = delivery.podcastStream.streamUrl;
                }
                const streams = delivery.Streams || delivery.streams;
                if (Array.isArray(streams) && streams.length > 0 && rawStreams.length === 0) {
                    rawStreams = streams;
                }
            }
        }
    } catch (e) {
        console.error("Panopto Downloader: Error reading global variables", e);
    }

    // 3. Try fetching DeliveryInfo.aspx if deliveryId is present and (no streams or only 1 stream found)
    if (deliveryId && (rawStreams.length <= 1 || !podcastUrl)) {
        try {
            const response = await fetch('/Panopto/Pages/Viewer/DeliveryInfo.aspx', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json, text/javascript, */*; q=0.01',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                body: JSON.stringify({ deliveryId: deliveryId, isLive: false, responseId: "" })
            });

            if (response.ok) {
                const text = await response.text();
                if (!text.trim().startsWith('<')) {
                    const data = JSON.parse(text);
                    if (data.SessionName || (data.Delivery && data.Delivery.SessionName)) {
                        detectedTitle = data.SessionName || data.Delivery.SessionName;
                    }
                    if (data.PodcastUrl) {
                        podcastUrl = data.PodcastUrl;
                    } else if (data.Delivery && data.Delivery.PodcastStream && data.Delivery.PodcastStream.StreamUrl) {
                        podcastUrl = data.Delivery.PodcastStream.StreamUrl;
                    }
                    if (data.Delivery && Array.isArray(data.Delivery.Streams) && data.Delivery.Streams.length > 0) {
                        // Merge or replace if richer
                        if (data.Delivery.Streams.length >= rawStreams.length) {
                            rawStreams = data.Delivery.Streams;
                        }
                    }
                }
            }
        } catch (e) {
            console.warn("Panopto Downloader: DeliveryInfo fetch failed", e);
        }
    }

    if (detectedTitle && (!sessionTitle || sessionTitle === "video")) {
        sessionTitle = detectedTitle;
    }
    const sanitizedTitle = sanitize(sessionTitle);

    // 4. Try Legacy Meta Tag if podcast is still not found
    if (!podcastUrl) {
        const streamMeta = document.querySelector('meta[name="twitter:player:stream"]');
        if (streamMeta && streamMeta.content) {
            podcastUrl = streamMeta.content;
        }
    }

    // 5. Brute-force Podcast Endpoints if nothing found yet
    if (!podcastUrl && rawStreams.length === 0 && deliveryId) {
        const baseUrl = window.location.origin;
        const potentialUrls = [
            `${baseUrl}/Panopto/Podcast/Download/${deliveryId}.mp4`,
            `${baseUrl}/Panopto/Podcast/Social/${deliveryId}.mp4`,
            `${baseUrl}/Panopto/Podcast/Syndication/${deliveryId}.mp4`,
            `${baseUrl}/Panopto/Podcast/Stream/${deliveryId}.mp4`
        ];

        for (const pUrl of potentialUrls) {
            try {
                const res = await fetch(pUrl, { method: 'HEAD' });
                if (res.ok || res.status === 302 || res.status === 304) {
                    const contentType = res.headers.get('content-type');
                    if (!contentType || contentType.includes('video') || contentType.includes('mp4') || contentType.includes('octet-stream')) {
                        podcastUrl = pUrl;
                        break;
                    }
                }
            } catch (e) { }
        }
    }

    // 6. Network Performance Entries (Captures streams requested by the player)
    let performanceUrls = [];
    try {
        const resources = window.performance.getEntriesByType("resource");
        performanceUrls = resources
            .map(r => r.name)
            .filter(name => (name.includes('.mp4') || name.includes('.m3u8')) && !name.includes('thumbnail') && !name.includes('preview'));
    } catch(e) {}

    // 7. Regex DOM Fallback
    let domMatches = [];
    try {
        const pageHtml = document.documentElement.innerHTML;
        const mp4Matches = pageHtml.match(/https?:\/\/[^"'\s<>]*?\.mp4[^"'\s<>]*/g) || [];
        const m3u8Matches = pageHtml.match(/https?:\/\/[^"'\s<>]*?\.m3u8[^"'\s<>]*/g) || [];
        domMatches = [...new Set([...mp4Matches, ...m3u8Matches])].map(makeAbsolute);
    } catch(e) {}

    // Process and assemble streams
    const streams = [];
    const seenUrls = new Set();

    const addStream = (item) => {
        if (!item || !item.url) return;
        const cleanUrl = makeAbsolute(item.url);
        // Normalize for duplicate check (ignore query params in comparison if base path matches)
        const baseKey = cleanUrl.split('?')[0];
        if (seenUrls.has(baseKey)) return;
        seenUrls.add(baseKey);

        streams.push({
            id: item.id || `stream-${streams.length}`,
            title: item.title,
            tag: item.tag || '',
            type: item.type, // 'primary' | 'secondary' | 'podcast'
            url: cleanUrl,
            filename: item.filename,
            offset: item.offset || 0
        });
    };

    // A. Process rawStreams from Delivery
    if (rawStreams.length > 0) {
        let primaryIdx = 0;
        let secondaryIdx = 0;

        rawStreams.forEach((stream, idx) => {
            const streamUrl = stream.StreamUrl || stream.streamUrl;
            if (!streamUrl) return;

            const streamTypeNum = stream.StreamType ?? stream.streamType;
            const tag = (stream.Tag || stream.tag || '').trim();

            const isPrimary = (streamTypeNum === 1 || tag.toLowerCase().includes('presenter') || tag.toLowerCase().includes('audiovideo') || idx === 0);
            const ext = streamUrl.includes('.m3u8') ? '.m3u8' : '.mp4';

            let type = isPrimary ? 'primary' : 'secondary';
            let title = '';
            let fileSuffix = '';

            if (isPrimary) {
                primaryIdx++;
                title = primaryIdx === 1 ? 'Presenter (Camera)' : `Presenter ${primaryIdx}`;
                fileSuffix = primaryIdx === 1 ? 'Presenter' : `Presenter-${primaryIdx}`;
            } else {
                secondaryIdx++;
                title = secondaryIdx === 1 ? 'Screen / Presentation' : `Screen ${secondaryIdx}`;
                fileSuffix = secondaryIdx === 1 ? 'Screen' : `Screen-${secondaryIdx}`;
            }

            addStream({
                id: `stream-${idx}`,
                title: title,
                tag: tag || (isPrimary ? 'Presenter' : 'Screen'),
                type: type,
                url: streamUrl,
                filename: `${sanitizedTitle} - ${fileSuffix}${ext}`,
                offset: stream.StartOffset || stream.startOffset || 0
            });
        });
    }

    // B. Add Podcast Stream if available
    if (podcastUrl) {
        const cleanPodcastUrl = makeAbsolute(podcastUrl);
        const ext = cleanPodcastUrl.includes('.m3u8') ? '.m3u8' : '.mp4';
        addStream({
            id: 'stream-podcast',
            title: 'Combined View (Podcast)',
            tag: 'Combined',
            type: 'podcast',
            url: cleanPodcastUrl,
            filename: `${sanitizedTitle} - Combined${ext}`,
            offset: 0
        });
    }

    // C. If still no streams, populate from performance entries
    if (streams.length === 0 && performanceUrls.length > 0) {
        const uniquePerf = [...new Set(performanceUrls)];
        uniquePerf.forEach((url, idx) => {
            const ext = url.includes('.m3u8') ? '.m3u8' : '.mp4';
            const isFirst = idx === 0;
            addStream({
                id: `stream-perf-${idx}`,
                title: isFirst ? 'Primary Video' : `Secondary Video ${idx}`,
                tag: isFirst ? 'Presenter' : 'Screen',
                type: isFirst ? 'primary' : 'secondary',
                url: url,
                filename: `${sanitizedTitle} - ${isFirst ? 'Presenter' : 'Screen'}${ext}`,
                offset: 0
            });
        });
    }

    // D. If still no streams, populate from DOM matches
    if (streams.length === 0 && domMatches.length > 0) {
        domMatches.forEach((url, idx) => {
            const ext = url.includes('.m3u8') ? '.m3u8' : '.mp4';
            const isFirst = idx === 0;
            addStream({
                id: `stream-dom-${idx}`,
                title: isFirst ? 'Video Feed 1' : `Video Feed ${idx + 1}`,
                tag: isFirst ? 'Primary' : 'Secondary',
                type: isFirst ? 'primary' : 'secondary',
                url: url,
                filename: `${sanitizedTitle} - Feed-${idx + 1}${ext}`,
                offset: 0
            });
        });
    }

    // Single stream edge-case: If only 1 stream was found, use standard filename without suffix
    if (streams.length === 1) {
        const singleExt = streams[0].url.includes('.m3u8') ? '.m3u8' : '.mp4';
        streams[0].filename = `${sanitizedTitle}${singleExt}`;
    }

    // Primary URL for backward compatibility
    let primaryUrl = "";
    let primaryFilename = `${sanitizedTitle}.mp4`;
    if (streams.length > 0) {
        const primary = streams.find(s => s.type === 'primary') || streams.find(s => s.type === 'podcast') || streams[0];
        primaryUrl = primary.url;
        primaryFilename = primary.filename;
    }

    return {
        title: sessionTitle,
        deliveryId: deliveryId,
        streams: streams,
        videoUrl: primaryUrl,
        name: primaryFilename
    };
})();
