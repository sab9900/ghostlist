import { Component, ElementRef, OnDestroy, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { LucideCircle, LucideRotateCcw, LucideSquare, LucideSwitchCamera, LucideX } from '@lucide/angular';
import { TranslatePipe } from '@ngx-translate/core';
import { generateThumbnails, getVideoDuration, isPlayableVideoBlob, isVideoTrimSupported, trimVideoBlob, withTimeout } from '../../core/utils/video-trim.util';
import { UserPreferencesService } from '../../core/services/user-preferences.service';
import { VideoTrimStripComponent } from '../video-trim-strip/video-trim-strip.component';

export interface VideoCaptureResult {
    blob: Blob;
    mimeType: string;
}

type CapturePhase = 'live' | 'recording' | 'review';

@Component({
    selector: 'app-video-capture',
    imports: [TranslatePipe, LucideCircle, LucideSquare, LucideSwitchCamera, LucideX, LucideRotateCcw, VideoTrimStripComponent],
    templateUrl: './video-capture.component.html',
    styleUrl: './video-capture.component.scss',
})
export class VideoCaptureComponent implements OnDestroy {
    private readonly prefs = inject(UserPreferencesService);

    readonly maxSeconds = input(60);
    readonly videoBitsPerSecond = input(600_000);
    readonly audioBitsPerSecond = input(96_000);

    readonly captured = output<VideoCaptureResult>();
    readonly closed = output<void>();

    protected readonly phase = signal<CapturePhase>('live');
    protected readonly seconds = signal(0);
    protected readonly availableCameras = signal<MediaDeviceInfo[]>([]);
    protected readonly selectedCameraId = signal<string | null>(null);
    protected readonly canSwitchCamera = computed(() => this.availableCameras().length > 1);
    protected readonly isFrontFacing = signal(true);
    protected readonly notSupported = signal(false);
    protected readonly permissionDenied = signal(false);
    protected readonly debugError = signal<string | null>(null);
    protected readonly processing = signal(false);

    protected readonly trimSupported = isVideoTrimSupported();
    protected readonly duration = signal(0);
    protected readonly trimStart = signal(0);
    protected readonly trimEnd = signal(0);
    protected readonly reviewUrl = signal<string | null>(null);
    protected readonly thumbnails = signal<string[]>([]);
    protected readonly playhead = signal(0);

    private static readonly THUMBNAIL_COUNT = 12;
    private static readonly TRIM_TIMEOUT_MS = 20_000;
    private static readonly MIN_VALID_TRIM_BYTES = 2_000;

    private readonly liveVideo = viewChild<ElementRef<HTMLVideoElement>>('liveVideo');
    private readonly reviewVideo = viewChild<ElementRef<HTMLVideoElement>>('reviewVideo');

    private stream: MediaStream | null = null;
    private recorder: MediaRecorder | null = null;
    private chunks: Blob[] = [];
    private timer: ReturnType<typeof setInterval> | null = null;
    private mimeType = '';
    private rawBlob: Blob | null = null;
    private rawUrl: string | null = null;

    constructor() {
        void this.startLivePreview();
    }

    protected formatTime(seconds: number): string {
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    }

    private async startLivePreview(): Promise<void> {
        if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
            this.notSupported.set(true);
            return;
        }
        try {
            await this.openStream();
            void this.refreshCameras();
        } catch (err) {
            this.handleMediaError(err);
        }
    }

    private async openStream(): Promise<void> {
        const cameraId = this.selectedCameraId();
        const videoConstraints: MediaTrackConstraints = cameraId
            ? { deviceId: { exact: cameraId }, width: { ideal: 640 }, height: { ideal: 480 } }
            : { facingMode: this.prefs.preferredCameraFacing(), width: { ideal: 640 }, height: { ideal: 480 } };
        const audioConstraints: MediaTrackConstraints = {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: 1,
            sampleRate: 48000,
        };
        const stream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints, audio: audioConstraints });
        this.stream = stream;
        this.phase.set('live');
        // Keep `selectedCameraId` in sync with whichever camera actually ended
        // up active — including the very first open, which picks a camera via
        // `facingMode` rather than `deviceId`. Without this, `selectedCameraId`
        // stayed `null` until the user's first switch, so `switchCamera()`
        // couldn't tell which camera was already showing and would often
        // "switch" to that same camera (by enumeration order) on the first
        // tap — only the second tap actually changed anything.
        const activeDeviceId = stream.getVideoTracks()[0]?.getSettings().deviceId ?? null;
        this.selectedCameraId.set(activeDeviceId);
        this.updateFacingMode(stream, cameraId);
        requestAnimationFrame(() => {
            const el = this.liveVideo()?.nativeElement;
            if (el) { el.srcObject = stream; void el.play().catch(() => { }); }
        });
    }

    private updateFacingMode(stream: MediaStream, cameraId: string | null): void {
        const track = stream.getVideoTracks()[0];
        const facingMode = track?.getSettings?.().facingMode;
        if (facingMode === 'user' || facingMode === 'environment') {
            this.isFrontFacing.set(facingMode === 'user');
        } else {
            const label = this.availableCameras().find(c => c.deviceId === cameraId)?.label?.toLowerCase() ?? '';
            if (/back|rear|environment/.test(label)) this.isFrontFacing.set(false);
            else if (/front|user|face/.test(label)) this.isFrontFacing.set(true);
            else this.isFrontFacing.set(!cameraId);
        }
        this.prefs.setPreferredCameraFacing(this.isFrontFacing() ? 'user' : 'environment');
    }

    private async refreshCameras(): Promise<void> {
        if (!navigator.mediaDevices?.enumerateDevices) return;
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            this.availableCameras.set(devices.filter(d => d.kind === 'videoinput'));
        } catch { }
    }

    private handleMediaError(err: unknown): void {
        if (err instanceof DOMException && err.name === 'NotAllowedError') {
            this.permissionDenied.set(true);
        } else {
            const errName = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
            this.debugError.set(errName);
            this.notSupported.set(true);
        }
    }

    async switchCamera(): Promise<void> {
        const cameras = this.availableCameras();
        if (cameras.length < 2) return;
        const current = this.selectedCameraId();
        const idx = cameras.findIndex(c => c.deviceId === current);
        const next = cameras[(idx + 1) % cameras.length];
        this.selectedCameraId.set(next.deviceId);
        this.stopStreamTracks();
        try { await this.openStream(); } catch (err) { this.handleMediaError(err); }
    }

    startRecording(): void {
        if (!this.stream) return;
        const mimeType = VideoCaptureComponent.getBestVideoMimeType();
        this.mimeType = mimeType;
        const options: MediaRecorderOptions = {
            videoBitsPerSecond: this.videoBitsPerSecond(),
            audioBitsPerSecond: this.audioBitsPerSecond(),
        };
        if (mimeType) options.mimeType = mimeType;
        this.recorder = new MediaRecorder(this.stream, options);
        this.chunks = [];
        this.recorder.ondataavailable = (e) => { if (e.data.size > 0) this.chunks.push(e.data); };
        this.recorder.onstop = () => void this.onRecordingStopped();
        this.recorder.start(100);
        this.phase.set('recording');
        this.seconds.set(0);
        this.timer = setInterval(() => {
            const next = this.seconds() + 1;
            this.seconds.set(next);
            if (next >= this.maxSeconds()) this.stopRecording();
        }, 1000);
    }

    stopRecording(): void {
        if (this.timer !== null) { clearInterval(this.timer); this.timer = null; }
        if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop();
    }

    private async onRecordingStopped(): Promise<void> {
        this.stopStreamTracks();
        const actualMime = this.recorder?.mimeType || this.mimeType || 'video/webm';
        this.mimeType = actualMime;
        const blob = new Blob(this.chunks, { type: actualMime });
        this.chunks = [];
        this.rawBlob = blob;
        this.rawUrl = URL.createObjectURL(blob);
        this.reviewUrl.set(this.rawUrl);
        this.phase.set('review');

        // Cover the gap between "recording stopped" and "trim controls are
        // actually usable" with the same processing overlay used for the
        // export step — `trimEnd` defaults to 0 until `duration` resolves,
        // so confirming/retaking before that point would also be wrong, not
        // just visually empty.
        //
        // Thumbnail generation is now awaited here too instead of being
        // fired in the background: it decodes the SAME blob through its own
        // `<video>` element, and if the user confirmed while that was still
        // running, `trimVideoBlob` ended up decoding that blob concurrently
        // with `generateThumbnails` — two decoders fighting over the same
        // resource, which is what was actually producing black/hung output,
        // not anything inside `trimVideoBlob` itself.
        this.processing.set(true);
        try {
            const dur = await getVideoDuration(this.rawUrl);
            this.duration.set(dur);
            this.trimStart.set(0);
            this.trimEnd.set(dur);
            if (this.trimSupported && dur > 0.4 && this.rawUrl) {
                this.thumbnails.set(await generateThumbnails(this.rawUrl, dur, VideoCaptureComponent.THUMBNAIL_COUNT).catch(() => []));
            }
        } catch {
        } finally {
            this.processing.set(false);
        }
    }

    private stopStreamTracks(): void {
        this.stream?.getTracks().forEach(t => t.stop());
        this.stream = null;
    }

    onTrimStartChange(value: number): void {
        const end = this.trimEnd();
        const clamped = Math.min(value, Math.max(0, end - 0.2));
        this.trimStart.set(clamped);
        this.seekReviewTo(clamped);
    }

    onTrimEndChange(value: number): void {
        const start = this.trimStart();
        const clamped = Math.max(value, start + 0.2);
        this.trimEnd.set(clamped);
        this.seekReviewTo(clamped);
    }

    onTrimDragStart(): void {
        this.reviewVideo()?.nativeElement.pause();
    }

    onReviewTimeUpdate(time: number): void {
        this.playhead.set(time);
    }

    private seekReviewTo(time: number): void {
        const el = this.reviewVideo()?.nativeElement;
        if (!el) return;
        el.pause();
        el.currentTime = time;
    }

    retake(): void {
        this.discardReview();
        void this.openStream().catch(err => this.handleMediaError(err));
    }

    private discardReview(): void {
        if (this.rawUrl) { URL.revokeObjectURL(this.rawUrl); this.rawUrl = null; }
        this.rawBlob = null;
        this.reviewUrl.set(null);
        this.duration.set(0);
        this.trimStart.set(0);
        this.trimEnd.set(0);
        this.thumbnails.set([]);
        this.playhead.set(0);
    }

    async confirm(): Promise<void> {
        if (!this.rawBlob) return;
        const isTrimmed = this.trimStart() > 0.05 || this.trimEnd() < this.duration() - 0.05;
        if (isTrimmed && this.trimSupported) {
            this.processing.set(true);
            try {
                const trimmed = await withTimeout(
                    trimVideoBlob(this.rawBlob, this.trimStart(), this.trimEnd()),
                    VideoCaptureComponent.TRIM_TIMEOUT_MS,
                );
                // The trim pipeline can resolve "successfully" with a blob
                // that's actually broken — too small to be real, or a
                // structurally fine container that decodes to nothing but
                // black frames. Sending either produces "video no longer
                // available" or a black playback on the receiving end
                // instead of an obvious failure here, so both are caught
                // and treated the same as a thrown error: fall back to the
                // untrimmed original.
                if (trimmed.size < VideoCaptureComponent.MIN_VALID_TRIM_BYTES || !(await isPlayableVideoBlob(trimmed))) {
                    throw new Error('Trimmed output failed validation');
                }
                // trimVideoBlob always outputs MP4 regardless of the
                // original recording's container (webm on Chrome/Android,
                // mp4 on Safari), so the emitted mime type must reflect
                // that rather than reusing the original recording's mime.
                this.captured.emit({ blob: trimmed, mimeType: 'video/mp4' });
            } catch {
                this.captured.emit({ blob: this.rawBlob, mimeType: this.mimeType });
            } finally {
                this.processing.set(false);
            }
        } else {
            this.captured.emit({ blob: this.rawBlob, mimeType: this.mimeType });
        }
    }

    close(): void {
        this.stopRecording();
        this.stopStreamTracks();
        this.discardReview();
        this.closed.emit();
    }

    ngOnDestroy(): void {
        if (this.timer !== null) clearInterval(this.timer);
        this.stopStreamTracks();
        this.discardReview();
    }

    private static getBestVideoMimeType(): string {
        const candidates = ['video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9,opus', 'video/webm', 'video/mp4'];
        for (const type of candidates) { if (MediaRecorder.isTypeSupported(type)) return type; }
        return '';
    }
}
