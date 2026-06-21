import { Component, ElementRef, OnDestroy, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { LucideCircle, LucideRotateCcw, LucideSquare, LucideSwitchCamera, LucideX } from '@lucide/angular';
import { TranslatePipe } from '@ngx-translate/core';
import { getVideoDuration, isVideoTrimSupported, trimVideoBlob } from '../../core/utils/video-trim.util';
import { UserPreferencesService } from '../../core/services/user-preferences.service';

export interface VideoCaptureResult {
    blob: Blob;
    mimeType: string;
}

type CapturePhase = 'live' | 'recording' | 'review';

@Component({
    selector: 'app-video-capture',
    imports: [TranslatePipe, LucideCircle, LucideSquare, LucideSwitchCamera, LucideX, LucideRotateCcw],
    templateUrl: './video-capture.component.html',
    styleUrl: './video-capture.component.scss',
})
export class VideoCaptureComponent implements OnDestroy {
    private readonly prefs = inject(UserPreferencesService);

    readonly maxSeconds = input(60);
    readonly videoBitsPerSecond = input(350_000);
    readonly audioBitsPerSecond = input(32_000);

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
        const stream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints, audio: true });
        this.stream = stream;
        this.phase.set('live');
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

        try {
            const dur = await getVideoDuration(this.rawUrl);
            this.duration.set(dur);
            this.trimStart.set(0);
            this.trimEnd.set(dur);
        } catch { }
    }

    private stopStreamTracks(): void {
        this.stream?.getTracks().forEach(t => t.stop());
        this.stream = null;
    }

    onTrimStartChange(value: number): void {
        const end = this.trimEnd();
        this.trimStart.set(Math.min(value, Math.max(0, end - 0.2)));
    }

    onTrimEndChange(value: number): void {
        const start = this.trimStart();
        this.trimEnd.set(Math.max(value, start + 0.2));
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
    }

    async confirm(): Promise<void> {
        if (!this.rawBlob) return;
        const isTrimmed = this.trimStart() > 0.05 || this.trimEnd() < this.duration() - 0.05;
        if (isTrimmed && this.trimSupported) {
            this.processing.set(true);
            try {
                const trimmed = await trimVideoBlob(this.rawBlob, this.trimStart(), this.trimEnd(), this.mimeType);
                this.captured.emit({ blob: trimmed, mimeType: this.mimeType });
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
