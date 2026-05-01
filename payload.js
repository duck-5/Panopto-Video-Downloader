(async () => {
    let name = "video.mp4";
    let videoUrl = "";

    const sanitize = (raw) => raw.replace(/[<>:"\/\\|?*\x00-\x1F]/g, '_');

    // 1. Get Title
    const titleMeta = document.querySelector('meta[property="og:title"]');
    if (titleMeta && titleMeta.content) {
        name = sanitize(titleMeta.content.split('?')[0]) + ".mp4";
    } else if (document.title) {
        name = sanitize(document.title) + ".mp4";
    }

    // 2. Try Global Javascript Variables
    try {
        if (typeof viewerData !== 'undefined' && viewerData.Delivery) {
            if (viewerData.Delivery.PodcastStream && viewerData.Delivery.PodcastStream.StreamUrl) {
                videoUrl = viewerData.Delivery.PodcastStream.StreamUrl;
            } else if (viewerData.Delivery.Streams && viewerData.Delivery.Streams.length > 0) {
                const mp4Stream = viewerData.Delivery.Streams.find(s => s.StreamUrl && s.StreamUrl.includes('.mp4'));
                if (mp4Stream) videoUrl = mp4Stream.StreamUrl;
            }
        }
        if (!videoUrl && typeof viewerState !== 'undefined' && viewerState.delivery) {
            if (viewerState.delivery.PodcastStream && viewerState.delivery.PodcastStream.StreamUrl) {
                videoUrl = viewerState.delivery.PodcastStream.StreamUrl;
            } else if (viewerState.delivery.Streams && viewerState.delivery.Streams.length > 0) {
                const mp4Stream = viewerState.delivery.Streams.find(s => s.StreamUrl && s.StreamUrl.includes('.mp4'));
                if (mp4Stream) videoUrl = mp4Stream.StreamUrl;
            }
        }
        if (!videoUrl && typeof Panopto !== 'undefined' && Panopto.viewer && Panopto.viewer.delivery) {
            if (Panopto.viewer.delivery.PodcastStream && Panopto.viewer.delivery.PodcastStream.StreamUrl) {
                videoUrl = Panopto.viewer.delivery.PodcastStream.StreamUrl;
            } else if (Panopto.viewer.delivery.Streams && Panopto.viewer.delivery.Streams.length > 0) {
                const mp4Stream = Panopto.viewer.delivery.Streams.find(s => s.StreamUrl && s.StreamUrl.includes('.mp4'));
                if (mp4Stream) videoUrl = mp4Stream.StreamUrl;
            }
        }
    } catch(e) {
        console.error("Panopto Downloader: Error reading global variables", e);
    }

    // 3. Try Legacy Meta Tag
    if (!videoUrl) {
        const streamMeta = document.querySelector('meta[name="twitter:player:stream"]');
        if (streamMeta && streamMeta.content) {
            videoUrl = streamMeta.content.split('?')[0];
        }
    }

    const urlParams = new URLSearchParams(window.location.search);
    const deliveryId = urlParams.get('id');

    // 4. Brute-force Podcast Endpoints (Highly effective with auth cookies)
    if (!videoUrl && deliveryId) {
        const baseUrl = window.location.origin;
        const potentialUrls = [
            `${baseUrl}/Panopto/Podcast/Social/${deliveryId}.mp4`,
            `${baseUrl}/Panopto/Podcast/Syndication/${deliveryId}.mp4`,
            `${baseUrl}/Panopto/Podcast/Download/${deliveryId}.mp4`,
            `${baseUrl}/Panopto/Podcast/Stream/${deliveryId}.mp4`
        ];

        for (const url of potentialUrls) {
            try {
                const res = await fetch(url, { method: 'HEAD' });
                if (res.ok || res.status === 302 || res.status === 304) {
                    const contentType = res.headers.get('content-type');
                    // Ensure we don't accidentally grab an HTML error page
                    if (!contentType || contentType.includes('video') || contentType.includes('mp4') || contentType.includes('octet-stream')) {
                        videoUrl = url;
                        break;
                    }
                }
            } catch (e) { }
        }
    }

    // 5. Try fetching DeliveryInfo.aspx
    if (!videoUrl && deliveryId) {
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
                    if (data.PodcastUrl) {
                        videoUrl = data.PodcastUrl;
                    } else if (data.Delivery && data.Delivery.PodcastStream && data.Delivery.PodcastStream.StreamUrl) {
                        videoUrl = data.Delivery.PodcastStream.StreamUrl;
                    }
                }
            }
        } catch (e) {}
    }

    // 6. Network Performance Entries (Captures the actual stream requested by the player)
    if (!videoUrl) {
        try {
            const resources = window.performance.getEntriesByType("resource");
            const mediaUrls = resources.filter(r => r.name.includes('.mp4') || r.name.includes('.m3u8') || r.name.includes('.mpd'));
            
            const mp4 = mediaUrls.find(r => r.name.includes('.mp4'));
            if (mp4) {
                videoUrl = mp4.name;
            } else if (mediaUrls.length > 0) {
                videoUrl = mediaUrls[0].name;
                if (videoUrl.includes('.m3u8')) name = name.replace('.mp4', '.m3u8');
                if (videoUrl.includes('.mpd')) name = name.replace('.mp4', '.mpd');
            }
        } catch(e) {}
    }

    // 7. Regex DOM
    if (!videoUrl) {
        try {
            const pageHtml = document.documentElement.innerHTML;
            const mp4Matches = pageHtml.match(/https?:\/\/[^"'\s<>]*?\.mp4[^"'\s<>]*/g);
            if (mp4Matches && mp4Matches.length > 0) {
                videoUrl = mp4Matches[0];
            } else {
                const m3u8Matches = pageHtml.match(/https?:\/\/[^"'\s<>]*?\.m3u8[^"'\s<>]*/g);
                if (m3u8Matches && m3u8Matches.length > 0) {
                    videoUrl = m3u8Matches[0];
                    name = name.replace('.mp4', '.m3u8'); 
                }
            }

            if (videoUrl) {
                videoUrl = videoUrl.replace(/\\\//g, '/');
                videoUrl = videoUrl.replace(/\\u0026/g, '&');
            }
        } catch(e) {}
    }

    // Final fix: Ensure URL is absolute
    if (videoUrl && videoUrl.startsWith('/')) {
        videoUrl = window.location.origin + videoUrl;
    }

    return { videoUrl, name };
})();
