(() => {
    let name = "video.mp4";
    let videoUrl = "";
    const metas = document.getElementsByTagName('meta');

    for (let i = 0; i < metas.length; i++) {
        if (metas[i].getAttribute("name") === "twitter:player:stream") {
            videoUrl = metas[i].getAttribute("content").split('?')[0];
        } else if (metas[i].getAttribute("property") === "og:title") {
            let rawName = metas[i].getAttribute("content").split('?')[0];
            name = rawName.replace(/[\/ :]/g, '_') + ".mp4";
        }
    }

    return { videoUrl, name };
})();
