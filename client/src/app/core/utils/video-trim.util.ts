export function isVideoTrimSupported(): boolean {
    return typeof HTMLCanvasElement !== 'undefined'
        && typeof HTMLCanvasElement.prototype.captureStream === 'function'
        && typeof AudioContext !== 'undefined'
        && typeof MediaRecorder !== 'undefined';
}

/**
 * MediaRecorder-produced webm blobs (the default on Chrome/Android) have no
 * duration field in the container — `video.duration` reads as `Infinity`
 * until the browser is forced to seek near the end and recompute it. This
 * resolves with the real, finite duration once that's done.
 */
function resolveFiniteDuration(video: HTMLVideoElement): Promise<number> {
    return new Promise((resolve) => {
        if (Number.isFinite(video.duration)) { resolve(video.duration); return; }
        const onTimeUpdate = () => {
            video.removeEventListener('timeupdate', onTimeUpdate);
            const dur = Number.isFinite(video.duration) ? video.duration : 0;
            video.currentTime = 0;
            resolve(dur);
        };
        video.addEventListener('timeupdate', onTimeUpdate);
        video.currentTime = Number.MAX_SAFE_INTEGER;
        setTimeout(() => {
            video.removeEventListener('timeupdate', onTimeUpdate);
            resolve(Number.isFinite(video.duration) ? video.duration : 0);
        }, 2000);
    });
}

export function getVideoDuration(blobUrl: string): Promise<number> {
    return new Promise((resolve, reject) => {
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.muted = true;
        video.onloadedmetadata = () => { void resolveFiniteDuration(video).then(resolve); };
        video.onerror = () => reject(new Error('Could not read video duration'));
        video.src = blobUrl;
    });
}

export async function trimVideoBlob(blob: Blob, startSec: number, endSec: number, mimeType: string): Promise<Blob> {
    const url = URL.createObjectURL(blob);
    const video = document.createElement('video');
    let audioCtx: AudioContext | null = null;
    let rafId = 0;

    try {
        video.muted = true;
        video.playsInline = true;
        video.src = url;

        const realDuration = await new Promise<number>((resolve, reject) => {
            video.onloadedmetadata = () => { void resolveFiniteDuration(video).then(resolve); };
            video.onerror = () => reject(new Error('Could not load video for trimming'));
        });

        const width = video.videoWidth || 640;
        const height = video.videoHeight || 480;
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas unavailable');

        audioCtx = new AudioContext();
        const source = audioCtx.createMediaElementSource(video);
        const destination = audioCtx.createMediaStreamDestination();
        source.connect(destination);

        const canvasStream = canvas.captureStream(30);
        const combined = new MediaStream([
            ...canvasStream.getVideoTracks(),
            ...destination.stream.getAudioTracks(),
        ]);

        const recorder = new MediaRecorder(combined, { mimeType });
        const chunks: Blob[] = [];
        recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
        const stopped = new Promise<void>((resolve) => { recorder.onstop = () => resolve(); });

        video.currentTime = startSec;
        await new Promise<void>((resolve) => { video.onseeked = () => resolve(); });

        const clampedEnd = Math.min(endSec, realDuration || endSec);
        const draw = () => {
            ctx.drawImage(video, 0, 0, width, height);
            if (video.currentTime < clampedEnd && !video.ended) {
                rafId = requestAnimationFrame(draw);
            } else {
                recorder.stop();
            }
        };

        recorder.start(100);
        await video.play();
        draw();

        await stopped;
        video.pause();

        return new Blob(chunks, { type: mimeType });
    } finally {
        if (rafId) cancelAnimationFrame(rafId);
        if (audioCtx) void audioCtx.close();
        URL.revokeObjectURL(url);
    }
}
