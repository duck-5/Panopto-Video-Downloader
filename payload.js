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

    const urlParams = new URLSearchParams(window.location.search);
    const deliveryId = urlParams.get('id');

    // Data containers
    let rawStreams = [];
    let podcastUrl = "";
    let detectedTitle = "";
    let rawTranscript = null;

    // 2. Read Panopto Delivery Data from Global JavaScript Variables
    try {
        const globalObjects = [
            (typeof Panopto !== 'undefined' && Panopto.viewer) ? Panopto.viewer : null,
            typeof viewerData !== 'undefined' ? viewerData : null,
            typeof viewerState !== 'undefined' ? viewerState : null,
            typeof Delivery !== 'undefined' ? Delivery : null
        ];

        for (const obj of globalObjects) {
            if (!obj) continue;
            const delivery = obj.Delivery || obj.delivery || (obj.Streams ? obj : null);
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
                if (!rawTranscript) {
                    rawTranscript = delivery.Transcript || delivery.transcript || delivery.Captions || delivery.captions || delivery.Timestamps;
                }
            }
        }
    } catch (e) {
        console.error("Panopto Downloader: Error reading global variables", e);
    }

    // 3. If no streams found from globals, fetch DeliveryInfo.aspx
    if (deliveryId && rawStreams.length === 0) {
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
                    const delivery = data.Delivery || data;
                    if (data.SessionName || delivery.SessionName) {
                        detectedTitle = data.SessionName || delivery.SessionName;
                    }
                    if (data.PodcastUrl) {
                        podcastUrl = data.PodcastUrl;
                    } else if (delivery.PodcastStream && delivery.PodcastStream.StreamUrl) {
                        podcastUrl = delivery.PodcastStream.StreamUrl;
                    }
                    if (delivery && Array.isArray(delivery.Streams) && delivery.Streams.length > 0) {
                        rawStreams = delivery.Streams;
                    }
                    if (!rawTranscript && delivery) {
                        rawTranscript = delivery.Transcript || delivery.Captions || delivery.Timestamps;
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

    // 4. Assemble Accurate Stream Feeds (No duplicates, no fake brute-force guessing)
    const streams = [];

    if (rawStreams.length > 0) {
        // Filter out items without any stream URL
        const validStreams = rawStreams.filter(s => {
            return Boolean(s && (s.StreamUrl || s.PublicObjectDownloadUrl || s.StreamHttpUrl || s.RelativeStreamUrl || s.Url));
        });

        if (validStreams.length === 1) {
            // Case 1: SINGLE-SCREEN RECORDING
            const s = validStreams[0];
            const primaryUrl = makeAbsolute(s.StreamUrl || s.PublicObjectDownloadUrl || s.StreamHttpUrl || s.Url);
            const isHls = primaryUrl.includes('.m3u8');

            // Find direct MP4 download link if available
            let downloadUrl = primaryUrl;
            if (s.PublicObjectDownloadUrl) {
                downloadUrl = makeAbsolute(s.PublicObjectDownloadUrl);
            } else if (isHls && podcastUrl && podcastUrl.includes('.mp4')) {
                downloadUrl = makeAbsolute(podcastUrl);
            }

            streams.push({
                id: 'stream-0',
                title: 'Presenter (Camera)',
                tag: s.Tag || 'Presenter',
                type: 'primary',
                url: primaryUrl,
                downloadUrl: downloadUrl,
                isHls: isHls,
                filename: `${sanitizedTitle}.mp4`,
                offset: s.StartOffset || s.startOffset || 0
            });

        } else if (validStreams.length >= 2) {
            // Case 2: DUAL-SCREEN / MULTI-SCREEN RECORDING
            let primaryStream = null;
            let secondaryStream = null;
            const extraStreams = [];

            validStreams.forEach((s, idx) => {
                const streamTypeNum = s.StreamType ?? s.streamType;
                const tag = (s.Tag || s.tag || '').toLowerCase();
                const isPrimary = (streamTypeNum === 1 || tag.includes('presenter') || tag.includes('audiovideo') || tag.includes('camera') || (idx === 0 && streamTypeNum !== 2));

                if (isPrimary && !primaryStream) {
                    primaryStream = s;
                } else if (!secondaryStream) {
                    secondaryStream = s;
                } else {
                    extraStreams.push(s);
                }
            });

            if (!primaryStream && validStreams[0]) primaryStream = validStreams[0];
            if (!secondaryStream && validStreams[1]) secondaryStream = validStreams[1];

            if (primaryStream) {
                const pUrl = makeAbsolute(primaryStream.StreamUrl || primaryStream.PublicObjectDownloadUrl || primaryStream.StreamHttpUrl || primaryStream.Url);
                const isHls = pUrl.includes('.m3u8');
                let dlUrl = pUrl;
                if (primaryStream.PublicObjectDownloadUrl) {
                    dlUrl = makeAbsolute(primaryStream.PublicObjectDownloadUrl);
                } else if (isHls && podcastUrl && podcastUrl.includes('.mp4')) {
                    dlUrl = makeAbsolute(podcastUrl);
                }

                streams.push({
                    id: 'stream-0',
                    title: 'Presenter (Camera)',
                    tag: primaryStream.Tag || 'Presenter',
                    type: 'primary',
                    url: pUrl,
                    downloadUrl: dlUrl,
                    isHls: isHls,
                    filename: `${sanitizedTitle} - Presenter.mp4`,
                    offset: primaryStream.StartOffset || primaryStream.startOffset || 0
                });
            }

            if (secondaryStream) {
                const sUrl = makeAbsolute(secondaryStream.StreamUrl || secondaryStream.PublicObjectDownloadUrl || secondaryStream.StreamHttpUrl || secondaryStream.Url);
                const isHls = sUrl.includes('.m3u8');
                let dlUrl = sUrl;
                if (secondaryStream.PublicObjectDownloadUrl) {
                    dlUrl = makeAbsolute(secondaryStream.PublicObjectDownloadUrl);
                }

                streams.push({
                    id: 'stream-1',
                    title: 'Screen / Presentation',
                    tag: secondaryStream.Tag || 'Screen',
                    type: 'secondary',
                    url: sUrl,
                    downloadUrl: dlUrl,
                    isHls: isHls,
                    filename: `${sanitizedTitle} - Screen.mp4`,
                    offset: secondaryStream.StartOffset || secondaryStream.startOffset || 0
                });
            }

            // Only add genuine extra screen feeds if present in Delivery.Streams
            extraStreams.forEach((ex, i) => {
                const eUrl = makeAbsolute(ex.StreamUrl || ex.PublicObjectDownloadUrl || ex.Url);
                const isHls = eUrl.includes('.m3u8');
                streams.push({
                    id: `stream-${i + 2}`,
                    title: `Screen Feed ${i + 2}`,
                    tag: ex.Tag || 'Screen',
                    type: 'secondary',
                    url: eUrl,
                    downloadUrl: eUrl,
                    isHls: isHls,
                    filename: `${sanitizedTitle} - Screen-${i + 2}.mp4`,
                    offset: ex.StartOffset || 0
                });
            });
        }
    }

    // Fallback: If Delivery.Streams was completely empty, inspect active DOM <video> elements
    if (streams.length === 0) {
        try {
            const domVideos = Array.from(document.querySelectorAll('video')).filter(v => {
                const src = v.currentSrc || v.src;
                return src && !src.startsWith('blob:') && (src.includes('.mp4') || src.includes('.m3u8'));
            });

            if (domVideos.length === 1) {
                const src = makeAbsolute(domVideos[0].currentSrc || domVideos[0].src);
                streams.push({
                    id: 'stream-0',
                    title: 'Presenter (Camera)',
                    tag: 'Presenter',
                    type: 'primary',
                    url: src,
                    downloadUrl: src,
                    isHls: src.includes('.m3u8'),
                    filename: `${sanitizedTitle}.mp4`,
                    offset: 0
                });
            } else if (domVideos.length >= 2) {
                const src1 = makeAbsolute(domVideos[0].currentSrc || domVideos[0].src);
                const src2 = makeAbsolute(domVideos[1].currentSrc || domVideos[1].src);
                streams.push({
                    id: 'stream-0',
                    title: 'Presenter (Camera)',
                    tag: 'Presenter',
                    type: 'primary',
                    url: src1,
                    downloadUrl: src1,
                    isHls: src1.includes('.m3u8'),
                    filename: `${sanitizedTitle} - Presenter.mp4`,
                    offset: 0
                });
                streams.push({
                    id: 'stream-1',
                    title: 'Screen / Presentation',
                    tag: 'Screen',
                    type: 'secondary',
                    url: src2,
                    downloadUrl: src2,
                    isHls: src2.includes('.m3u8'),
                    filename: `${sanitizedTitle} - Screen.mp4`,
                    offset: 0
                });
            }
        } catch(e) {}
    }

    // 5. Extract & Format Closed Captions / Subtitles
    let srtContent = "";
    let vttContent = "";
    let txtContent = "";

    function formatSrtTime(seconds) {
        if (isNaN(seconds) || seconds < 0) seconds = 0;
        const pad = (n, z = 2) => String(Math.floor(n)).padStart(z, '0');
        const h = pad(seconds / 3600);
        const m = pad((seconds % 3600) / 60);
        const s = pad(seconds % 60);
        const ms = pad(Math.round((seconds % 1) * 1000), 3);
        return `${h}:${m}:${s},${ms}`;
    }

    function transcriptArrayToSrt(items) {
        if (!Array.isArray(items) || items.length === 0) return "";
        let srt = "";
        let count = 1;
        items.forEach((item, index) => {
            const startSec = item.Time ?? item.Start ?? item.start ?? 0;
            const nextItem = items[index + 1];
            const endSec = item.EndTime ?? item.End ?? item.end ?? (nextItem ? (nextItem.Time ?? nextItem.Start ?? startSec + 3) : startSec + 4);
            const text = (item.Text || item.Caption || item.caption || item.text || "").trim();
            if (!text) return;
            srt += `${count}\n${formatSrtTime(startSec)} --> ${formatSrtTime(endSec)}\n${text}\n\n`;
            count++;
        });
        return srt.trim();
    }

    function srtToVtt(srtText) {
        if (!srtText) return "";
        let clean = srtText.replace(/\r\n/g, '\n').trim();
        return "WEBVTT\n\n" + clean.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
    }

    function srtToTxt(srtText) {
        if (!srtText) return "";
        return srtText
            .replace(/\r\n/g, '\n')
            .replace(/^\d+\s*$/gm, '')
            .replace(/\d{2}:\d{2}:\d{2}[,\.]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[,\.]\d{3}/gm, '')
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0)
            .join(' ');
    }

    // Try GenerateSRT.ashx endpoint with authentication
    if (deliveryId) {
        const srtCandidates = [
            `/Panopto/Pages/Transcription/GenerateSRT.ashx?id=${deliveryId}&language=1`,
            `/Panopto/Pages/Transcription/GenerateSRT.ashx?id=${deliveryId}&language=0`,
            `/Panopto/Pages/Transcription/GenerateSRT.ashx?id=${deliveryId}`
        ];
        for (const candidateUrl of srtCandidates) {
            try {
                const res = await fetch(candidateUrl);
                if (res.ok) {
                    const text = await res.text();
                    if (text && text.includes('-->') && !text.trim().startsWith('<')) {
                        srtContent = text.trim();
                        break;
                    }
                }
            } catch(e) {}
        }
    }

    // Fallback to in-memory transcript array if available
    if (!srtContent && rawTranscript && Array.isArray(rawTranscript)) {
        srtContent = transcriptArrayToSrt(rawTranscript);
    }

    if (srtContent) {
        vttContent = srtToVtt(srtContent);
        txtContent = srtToTxt(srtContent);
    }

    return {
        title: sessionTitle,
        deliveryId: deliveryId,
        streams: streams,
        captions: {
            hasCaptions: Boolean(srtContent),
            srt: srtContent,
            vtt: vttContent,
            txt: txtContent
        }
    };
})();
