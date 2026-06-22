import { ALL_FORMATS, BlobSource, BufferTarget, Conversion, Input, Mp4OutputFormat, Output } from 'mediabunny';

export function isVideoTrimSupported(): boolean {
    return typeof VideoEncoder !== 'undefined' && typeof VideoDecoder !== 'undefined';
}

/**
 * Races a promise against a hard deadline. The trim pipeline below has
 * turned out to be unreliable on some devices/browsers — sometimes it never
 * resolves at all (the MediaRecorder's `stop` event just never fires). No
 * matter what's wrong with it, it must never be able to hang the UI
 * forever; if it doesn't finish in time we give up on it and let the
 * caller fall back to sending the untrimmed clip instead.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms);
        promise.then(
            value => { clearTimeout(timer); resolve(value); },
            err => { clearTimeout(timer); reject(err); },
        );
    });
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

/**
 * Last line of defense before a trimmed clip gets sent anywhere: loads the
 * blob, confirms it actually has real video dimensions, and samples a
 * frame to rule out the specific failure mode this pipeline keeps
 * producing on some platforms (confirmed on iOS Safari) — a container that
 * looks structurally fine but decodes to nothing but black. A blob this
 * function rejects should be treated exactly like a thrown error: fall
 * back to the untrimmed original instead of sending it.
 */
export async function isPlayableVideoBlob(blob: Blob): Promise<boolean> {
    const url = URL.createObjectURL(blob);
    const video = document.createElement('video');
    try {
        video.muted = true;
        video.playsInline = true;
        video.src = url;

        await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('Metadata load timed out')), 4000);
            video.onloadedmetadata = () => { clearTimeout(timer); resolve(); };
            video.onerror = () => { clearTimeout(timer); reject(new Error('Could not load trimmed video')); };
        });

        if (!video.videoWidth || !video.videoHeight) return false;

        await new Promise<void>(resolve => {
            const onSeeked = () => { video.removeEventListener('seeked', onSeeked); resolve(); };
            video.addEventListener('seeked', onSeeked);
            video.currentTime = Math.min(0.1, (Number.isFinite(video.duration) ? video.duration : 1) / 2);
            setTimeout(resolve, 1000);
        });

        const canvas = document.createElement('canvas');
        canvas.width = Math.min(64, video.videoWidth);
        canvas.height = Math.min(64, video.videoHeight);
        const ctx = canvas.getContext('2d');
        if (!ctx) return true;

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
        let total = 0;
        for (let i = 0; i < data.length; i += 4) total += data[i] + data[i + 1] + data[i + 2];
        const avgBrightness = total / (data.length / 4);
        return avgBrightness > 4;
    } catch {
        return false;
    } finally {
        video.removeAttribute('src');
        video.load();
        URL.revokeObjectURL(url);
    }
}

/**
 * Some browsers (notably Safari/WebKit, including the iOS Capacitor
 * WebView) only decode frames into an off-DOM `<video>` element
 * inconsistently, which makes `drawImage`/`captureStream` read back
 * black frames. Attaching the element to the document fixes most of
 * that — but pushing it far outside the viewport (e.g. `left: -9999px`)
 * re-introduces the same problem, since browsers also throttle/suspend
 * decoding for elements they consider "not visible" via an
 * intersection-style check against the actual viewport. So this keeps
 * the element within real viewport coordinates and only hides it with
 * `opacity: 0` + `pointer-events: none`, which doesn't affect decoding.
 */
function attachOffscreen(video: HTMLVideoElement): void {
    video.style.position = 'fixed';
    video.style.top = '0';
    video.style.left = '0';
    video.style.width = '320px';
    video.style.height = '180px';
    video.style.opacity = '0';
    video.style.pointerEvents = 'none';
    video.setAttribute('aria-hidden', 'true');
    document.body.appendChild(video);
}

function seekVideoTo(video: HTMLVideoElement, time: number): Promise<void> {
    return new Promise((resolve) => {
        const onSeeked = () => {
            video.removeEventListener('seeked', onSeeked);
            clearTimeout(fallback);
            resolve();
        };
        const fallback = setTimeout(() => {
            video.removeEventListener('seeked', onSeeked);
            resolve();
        }, 500);
        video.addEventListener('seeked', onSeeked);
        video.currentTime = time;
    });
}

/**
 * Generates evenly time-spaced JPEG thumbnails across the clip for a
 * WhatsApp/iOS-style filmstrip. Resolves to an empty array if anything
 * about the source video can't be read — callers should treat the strip
 * as a graceful, optional enhancement.
 */
export async function generateThumbnails(blobUrl: string, duration: number, count: number, thumbHeight = 96): Promise<string[]> {
    if (duration <= 0 || count <= 0) return [];

    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = blobUrl;
    attachOffscreen(video);

    try {
        await new Promise<void>((resolve, reject) => {
            video.onloadedmetadata = () => resolve();
            video.onerror = () => reject(new Error('Could not load video for thumbnails'));
        });

        const aspect = (video.videoWidth || 16) / (video.videoHeight || 9);
        const height = thumbHeight;
        const width = Math.max(1, Math.round(height * aspect));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return [];

        const thumbnails: string[] = [];
        const step = duration / count;

        for (let i = 0; i < count; i++) {
            const time = Math.min(Math.max(0, duration - 0.05), i * step + step / 2);
            await seekVideoTo(video, time);
            ctx.drawImage(video, 0, 0, width, height);
            thumbnails.push(canvas.toDataURL('image/jpeg', 0.6));
        }

        return thumbnails;
    } catch {
        return [];
    } finally {
        video.removeAttribute('src');
        video.load();
        video.remove();
    }
}

// The previous implementation of this function hand-rolled trimming via
// `<video>` + `<canvas>` + `canvas.captureStream()` + `MediaRecorder`. That
// approach turned out to be fundamentally unreliable on iOS Safari — a
// long-documented WebKit weakness where `MediaRecorder` recording a
// synthetic (canvas-sourced) stream produces black or corrupted output,
// no matter how carefully the capture timing is handled. This rewrite
// uses `mediabunny` (https://mediabunny.dev), which drives the same job
// through the WebCodecs API directly (the same decode/encode path native
// camera recording uses), with `MediaRecorder` out of the picture entirely.
//
// Output is always MP4/H.264+AAC regardless of the input container (webm
// on Chrome/Android, mp4 on Safari) for universal playback compatibility,
// since WebM doesn't play at all in Safari.
export async function trimVideoBlob(blob: Blob, startSec: number, endSec: number): Promise<Blob> {
    const input = new Input({
        formats: ALL_FORMATS,
        source: new BlobSource(blob),
    });
    const output = new Output({
        format: new Mp4OutputFormat(),
        target: new BufferTarget(),
    });

    try {
        const conversion = await Conversion.init({
            input,
            output,
            trim: { start: startSec, end: endSec },
        });

        if (!conversion.isValid) {
            throw new Error('Trim conversion is not valid for this clip');
        }

        // Losing audio entirely would be a worse outcome than not trimming
        // at all — e.g. on iOS versions before Safari 26, which lack the
        // WebCodecs AudioEncoder/AudioDecoder needed to re-encode audio.
        // Bail out here so the caller falls back to sending the untrimmed
        // original (with its audio intact) instead of a silent clip.
        const droppedAudio = conversion.discardedTracks.some(t => t.track.isAudioTrack());
        if (droppedAudio) {
            throw new Error('Trim would drop the audio track');
        }

        await conversion.execute();

        const buffer = output.target.buffer;
        if (!buffer) throw new Error('Conversion produced no output buffer');
        return new Blob([buffer], { type: 'video/mp4' });
    } finally {
        input.dispose();
    }
}
