import { Component, computed, effect, ElementRef, inject, OnDestroy, signal, untracked, ViewChild } from '@angular/core';
import { LucideFileText, LucideImage, LucideMic, LucidePaperclip, LucideSwitchCamera, LucideVideo } from "@lucide/angular";
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';
import { CharonDropDto } from '../../../core/models';
import { CryptoService } from '../../../core/services/crypto.service';
import { DeviceIdService } from '../../../core/services/device-id.service';
import { HapticsService } from '../../../core/services/haptics.service';
import { ImageViewerService } from '../../../core/services/image-viewer.service';
import { UserIdService } from '../../../core/services/user-id.service';
import { UserPreferencesService } from '../../../core/services/user-preferences.service';
import { AudioWaveformPlayerComponent } from '../../../shared/audio-waveform-player/audio-waveform-player.component';
import { AppStore } from '../../../store/app.store';
import { ShareHandlerService } from '../../../core/services/share-handler.service';


interface CharonMeta {
    fileName: string;
    mimeType: string;
    size: number;
    senderName: string;
}

interface RevealedDrop {
    id: string;
    dataUrl: string;
    fileName: string;
    mimeType: string;
    size: number;
    senderName: string;
    isImage: boolean;
    isAudio: boolean;
    isVideo: boolean;
}

const MAX_FILE_SIZE = 8 * 1024 * 1024;

const MAX_IMAGE_DIMENSION = 1280;
const IMAGE_QUALITY = 0.72;

const MAX_VIDEO_RECORDING_SECONDS = 30;
const VIDEO_BITS_PER_SECOND = 350_000;
const VIDEO_AUDIO_BITS_PER_SECOND = 32_000;

const ALLOWED_EXTENSIONS = new Set([

    'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'heic', 'heif',

    'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp', 'txt', 'rtf', 'csv',

    'mp3', 'wav', 'm4a', 'ogg', 'flac', 'mp4', 'mov', 'webm', 'avi',

    'zip',
]);

function isAllowedFile(file: File): boolean {
    const ext = file.name.split('.').pop()?.toLowerCase();
    return !!ext && ALLOWED_EXTENSIONS.has(ext);
}

@Component({
    selector: 'app-charon-tab',
    imports: [TranslatePipe, AudioWaveformPlayerComponent, LucidePaperclip, LucideMic, LucideImage, LucideFileText, LucideVideo, LucideSwitchCamera],
    templateUrl: './charon-tab.component.html',
    styleUrl: './charon-tab.component.scss',
})
export class CharonTabComponent implements OnDestroy {
    protected readonly store = inject(AppStore);
    protected readonly prefs = inject(UserPreferencesService);
    protected readonly deviceId = inject(DeviceIdService);
    protected readonly userId = inject(UserIdService);
    private readonly crypto = inject(CryptoService);
    private readonly haptics = inject(HapticsService);
    private readonly translate = inject(TranslateService);
    private readonly imageViewer = inject(ImageViewerService);

    @ViewChild('fileInput') private fileInputRef?: ElementRef<HTMLInputElement>;
    @ViewChild('videoPreview') private videoPreviewRef?: ElementRef<HTMLVideoElement>;

    protected readonly dropMeta = signal<Map<string, CharonMeta>>(new Map());

    protected readonly revealedDrops = signal<RevealedDrop[]>([]);
    protected readonly sending = signal(false);
    protected readonly fileTooLarge = signal(false);
    protected readonly fileTypeNotAllowed = signal(false);
    protected readonly recording = signal(false);
    protected readonly recordingSeconds = signal(0);
    protected readonly recordingNotSupported = signal(false);
    protected readonly recordingPermissionDenied = signal(false);
    protected readonly recordingDebugError = signal<string | null>(null);
    protected readonly recordingVideo = signal(false);
    protected readonly recordingVideoSeconds = signal(0);
    protected readonly videoRecordingNotSupported = signal(false);
    protected readonly videoRecordingPermissionDenied = signal(false);
    protected readonly videoRecordingDebugError = signal<string | null>(null);
    protected readonly availableCameras = signal<MediaDeviceInfo[]>([]);
    protected readonly selectedCameraId = signal<string | null>(null);
    protected readonly canSwitchCamera = computed(() => this.availableCameras().length > 1);

    private mediaRecorder: MediaRecorder | null = null;
    private audioChunks: Blob[] = [];
    private recordingTimer: ReturnType<typeof setInterval> | null = null;

    private videoRecorder: MediaRecorder | null = null;
    private videoChunks: Blob[] = [];
    private videoRecordingTimer: ReturnType<typeof setInterval> | null = null;
    private videoStream: MediaStream | null = null;
    private discardNextVideoStop = false;

    private readonly blobUrls = new Map<string, string>();

    private readonly shareHandler = inject(ShareHandlerService);

    constructor() {
        void this.refreshAvailableCameras();
        effect(() => {
            const drops = this.store.charonDrops();
            void this.decryptNewMeta(drops);
        });

        effect(() => {
            const payload = this.shareHandler.pendingPayload();
            if (!payload || !payload.confirmed || payload.target !== 'charon') return;
            untracked(() => {
                const files = payload.files;
                if (files.length > 0) {
                    void this.sendFiles(files);
                }
            });
        });
    }

    private async decryptNewMeta(drops: CharonDropDto[]): Promise<void> {
        const key = this.store.currentEncryptionKey();
        if (!key) return;

        const known = untracked(() => this.dropMeta());
        const additions = new Map<string, CharonMeta>();

        for (const drop of drops) {
            if (known.has(drop.id)) continue;
            try {
                const json = await this.crypto.decrypt(drop.encryptedMetadata, drop.metadataInitializationVector, key);
                additions.set(drop.id, JSON.parse(json) as CharonMeta);
            } catch { }
        }

        if (additions.size === 0) return;
        this.dropMeta.update(map => {
            const next = new Map(map);
            for (const [id, meta] of additions) next.set(id, meta);
            return next;
        });
    }

    protected meta(dropId: string): CharonMeta | null {
        return this.dropMeta().get(dropId) ?? null;
    }

    protected isMine(drop: CharonDropDto): boolean {
        if (drop.senderUserId !== null) return drop.senderUserId === this.userId.userId();
        if (drop.senderDeviceId !== null) return drop.senderDeviceId === this.deviceId.deviceId;
        return false;
    }

    protected isImageMime(mimeType: string | undefined): boolean {
        return !!mimeType?.startsWith('image/');
    }

    protected isAudioMime(mimeType: string | undefined): boolean {
        return !!mimeType?.startsWith('audio/');
    }

    protected isVideoMime(mimeType: string | undefined): boolean {
        return !!mimeType?.startsWith('video/');
    }

    protected formatSize(bytes: number): string {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }

    protected openImage(src: string, alt: string): void {
        this.imageViewer.open(src, alt);
    }

    async reveal(drop: CharonDropDto): Promise<void> {
        const key = this.store.currentEncryptionKey();
        if (!key) return;

        const confirmMsg = await firstValueFrom(this.translate.get('CHARON.REVEAL_CONFIRM'));
        if (!confirm(confirmMsg)) return;

        let meta = this.meta(drop.id);
        try {
            if (!meta) {
                const json = await this.crypto.decrypt(drop.encryptedMetadata, drop.metadataInitializationVector, key);
                meta = JSON.parse(json) as CharonMeta;
            }
            const dataUrl = await this.crypto.decrypt(drop.encryptedContent, drop.contentInitializationVector, key);

            const isAudio = this.isAudioMime(meta!.mimeType);
            const isVideo = this.isVideoMime(meta!.mimeType);
            let srcUrl = dataUrl;
            if (isAudio || isVideo) {
                const blob = CharonTabComponent.dataUrlToBlob(dataUrl);
                srcUrl = URL.createObjectURL(blob);
                this.blobUrls.set(drop.id, srcUrl);
            }

            this.revealedDrops.update(list => [...list, {
                id: drop.id,
                dataUrl: srcUrl,
                fileName: meta!.fileName,
                mimeType: meta!.mimeType,
                size: meta!.size,
                senderName: meta!.senderName,
                isImage: this.isImageMime(meta!.mimeType),
                isAudio,
                isVideo,
            }]);
        } catch {
            return;
        }

        await this.store.viewCharonDrop(drop.id);
    }

    dismiss(id: string): void {
        const blobUrl = this.blobUrls.get(id);
        if (blobUrl) {
            URL.revokeObjectURL(blobUrl);
            this.blobUrls.delete(id);
        }
        this.revealedDrops.update(list => list.filter(d => d.id !== id));
    }

    async recall(drop: CharonDropDto): Promise<void> {
        const confirmMsg = await firstValueFrom(this.translate.get('CHARON.RECALL_CONFIRM'));
        if (!confirm(confirmMsg)) return;
        await this.store.recallCharonDrop(drop.id);
    }

    download(drop: RevealedDrop): void {
        const a = document.createElement('a');
        a.href = drop.dataUrl;
        a.download = drop.fileName;
        a.click();
    }

    pickFile(): void {
        this.fileInputRef?.nativeElement.click();
    }

    async onFileSelected(event: Event): Promise<void> {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        input.value = '';
        if (!file) return;
        await this.sendFiles([file]);
    }

    async sendFiles(files: File[]): Promise<void> {
        const key = this.store.currentEncryptionKey();
        if (!key) return;

        this.shareHandler.consume();
        this.sending.set(true);
        try {
            for (const file of files) {
                if (!isAllowedFile(file)) {
                    this.fileTypeNotAllowed.set(true);
                    setTimeout(() => this.fileTypeNotAllowed.set(false), 4000);
                    continue;
                }

                if (file.size > MAX_FILE_SIZE) {
                    this.fileTooLarge.set(true);
                    setTimeout(() => this.fileTooLarge.set(false), 4000);
                    continue;
                }

                const dataUrl = file.type.startsWith('image/')
                    ? await this.compressImage(file)
                    : await this.readAsDataUrl(file);

                const senderName = this.prefs.senderName() || await firstValueFrom(this.translate.get('CHAT.ANONYMOUS'));
                const meta: CharonMeta = {
                    fileName: file.name,
                    mimeType: file.type || 'application/octet-stream',
                    size: file.size,
                    senderName,
                };

                const [content, metadata] = await Promise.all([
                    this.crypto.encrypt(dataUrl, key),
                    this.crypto.encrypt(JSON.stringify(meta), key),
                ]);

                await this.store.sendCharonDrop(
                    content.ciphertext, content.iv,
                    metadata.ciphertext, metadata.iv,
                );
                this.haptics.charonDropSent();
            }
        } catch {
        } finally {
            this.sending.set(false);
        }
    }

    ngOnDestroy(): void {
        if (this.recordingTimer !== null) clearInterval(this.recordingTimer);
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') this.mediaRecorder.stop();
        if (this.videoRecordingTimer !== null) clearInterval(this.videoRecordingTimer);
        if (this.videoRecorder && this.videoRecorder.state !== 'inactive') this.videoRecorder.stop();
        if (this.videoStream) this.videoStream.getTracks().forEach(t => t.stop());
        this.blobUrls.forEach(url => URL.revokeObjectURL(url));
        this.blobUrls.clear();
    }

    protected formatRecordingTime(seconds: number): string {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    }

    async toggleRecording(): Promise<void> {
        if (this.recording()) {
            this.haptics.charonDropSent();
            await this.stopRecording();
        } else {
            await this.startRecording();
        }
    }

    private async startRecording(): Promise<void> {
        if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
            const reason = !navigator.mediaDevices
                ? 'mediaDevices undefined'
                : !navigator.mediaDevices.getUserMedia
                    ? 'getUserMedia undefined'
                    : 'MediaRecorder undefined';
            this.recordingDebugError.set(reason);
            this.recordingNotSupported.set(true);
            setTimeout(() => { this.recordingNotSupported.set(false); this.recordingDebugError.set(null); }, 8000);
            return;
        }

        let stream: MediaStream;
        try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (err) {
            if (err instanceof DOMException && err.name === 'NotAllowedError') {
                this.recordingPermissionDenied.set(true);
                setTimeout(() => this.recordingPermissionDenied.set(false), 5000);
            } else {
                const errName = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
                this.recordingDebugError.set(errName);
                this.recordingNotSupported.set(true);
                setTimeout(() => { this.recordingNotSupported.set(false); this.recordingDebugError.set(null); }, 8000);
            }
            return;
        }

        const mimeType = CharonTabComponent.getBestAudioMimeType();
        this.mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        this.audioChunks = [];

        this.mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) this.audioChunks.push(e.data);
        };

        this.mediaRecorder.onstop = () => {
            stream.getTracks().forEach(t => t.stop());
            const actualMime = this.mediaRecorder?.mimeType || mimeType || 'audio/webm';
            void this.sendAudioRecording(actualMime);
        };

        this.mediaRecorder.start(100);
        this.recording.set(true);
        this.recordingSeconds.set(0);

        this.recordingTimer = setInterval(() => {
            const next = this.recordingSeconds() + 1;
            this.recordingSeconds.set(next);
            if (next >= 60) void this.stopRecording();
        }, 1000);
    }

    private async stopRecording(): Promise<void> {
        if (this.recordingTimer !== null) {
            clearInterval(this.recordingTimer);
            this.recordingTimer = null;
        }
        this.recording.set(false);
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
        }
    }

    private async sendAudioRecording(mimeType: string): Promise<void> {
        const blob = new Blob(this.audioChunks, { type: mimeType });
        this.audioChunks = [];

        if (blob.size > MAX_FILE_SIZE) {
            this.fileTooLarge.set(true);
            setTimeout(() => this.fileTooLarge.set(false), 4000);
            return;
        }

        const listId = this.store.currentListId();
        const key = this.store.currentEncryptionKey();
        if (!listId || !key) return;

        const ext = CharonTabComponent.getAudioExtension(mimeType);
        const fileName = `voice-${Date.now()}.${ext}`;

        this.sending.set(true);
        try {
            const dataUrl = await this.blobToDataUrl(blob);
            const senderName = this.prefs.senderName() || await firstValueFrom(this.translate.get('CHAT.ANONYMOUS'));
            const meta: CharonMeta = { fileName, mimeType, size: blob.size, senderName };

            const [content, metadata] = await Promise.all([
                this.crypto.encrypt(dataUrl, key),
                this.crypto.encrypt(JSON.stringify(meta), key),
            ]);

            await this.store.sendCharonDrop(
                content.ciphertext, content.iv,
                metadata.ciphertext, metadata.iv,
            );
            this.haptics.charonDropSent();
        } catch {
        } finally {
            this.sending.set(false);
        }
    }

    private blobToDataUrl(blob: Blob): Promise<string> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(reader.error ?? new Error('Could not read blob'));
            reader.onload = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
        });
    }

    private static dataUrlToBlob(dataUrl: string): Blob {
        const [header, b64] = dataUrl.split(',');
        const mime = header.match(/:(.*?);/)?.[1] ?? 'application/octet-stream';
        const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
        return new Blob([bytes], { type: mime });
    }

    private static getBestAudioMimeType(): string {
        const candidates = [
            'audio/webm;codecs=opus',
            'audio/webm',
            'audio/mp4',
            'audio/ogg;codecs=opus',
            'audio/ogg',
        ];
        for (const type of candidates) {
            if (MediaRecorder.isTypeSupported(type)) return type;
        }
        return '';
    }

    private static getAudioExtension(mimeType: string): string {
        if (mimeType.startsWith('audio/webm')) return 'webm';
        if (mimeType.startsWith('audio/mp4')) return 'm4a';
        if (mimeType.startsWith('audio/ogg')) return 'ogg';
        return 'audio';
    }

    private async refreshAvailableCameras(): Promise<void> {
        if (!navigator.mediaDevices?.enumerateDevices) return;
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            this.availableCameras.set(devices.filter(d => d.kind === 'videoinput'));
        } catch { }
    }

    async switchCamera(): Promise<void> {
        const cameras = this.availableCameras();
        if (cameras.length < 2) return;
        const current = this.selectedCameraId();
        const idx = cameras.findIndex(c => c.deviceId === current);
        const next = cameras[(idx + 1) % cameras.length];
        this.selectedCameraId.set(next.deviceId);
        if (this.recordingVideo()) {
            this.discardNextVideoStop = true;
            if (this.videoRecordingTimer !== null) { clearInterval(this.videoRecordingTimer); this.videoRecordingTimer = null; }
            if (this.videoRecorder && this.videoRecorder.state !== 'inactive') this.videoRecorder.stop();
            else if (this.videoStream) this.videoStream.getTracks().forEach(t => t.stop());
            this.videoChunks = [];
            await this.startVideoRecording();
        }
    }

    async toggleVideoRecording(): Promise<void> {
        if (this.recordingVideo()) {
            this.haptics.charonDropSent();
            await this.stopVideoRecording();
        } else {
            await this.startVideoRecording();
        }
    }

    private async startVideoRecording(): Promise<void> {
        if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
            const reason = !navigator.mediaDevices
                ? 'mediaDevices undefined'
                : !navigator.mediaDevices.getUserMedia
                    ? 'getUserMedia undefined'
                    : 'MediaRecorder undefined';
            this.videoRecordingDebugError.set(reason);
            this.videoRecordingNotSupported.set(true);
            setTimeout(() => { this.videoRecordingNotSupported.set(false); this.videoRecordingDebugError.set(null); }, 8000);
            return;
        }

        const cameraId = this.selectedCameraId();
        const videoConstraints: MediaTrackConstraints = cameraId
            ? { deviceId: { exact: cameraId }, width: { ideal: 640 }, height: { ideal: 480 } }
            : { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } };
        let stream: MediaStream;
        try {
            stream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints, audio: true });
        } catch (err) {
            if (err instanceof DOMException && err.name === 'NotAllowedError') {
                this.videoRecordingPermissionDenied.set(true);
                setTimeout(() => this.videoRecordingPermissionDenied.set(false), 5000);
            } else {
                const errName = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
                this.videoRecordingDebugError.set(errName);
                this.videoRecordingNotSupported.set(true);
                setTimeout(() => { this.videoRecordingNotSupported.set(false); this.videoRecordingDebugError.set(null); }, 8000);
            }
            return;
        }

        void this.refreshAvailableCameras();
        this.videoStream = stream;
        this.recordingVideo.set(true);
        this.recordingVideoSeconds.set(0);

        requestAnimationFrame(() => {
            const videoEl = this.videoPreviewRef?.nativeElement;
            if (videoEl) { videoEl.srcObject = stream; void videoEl.play().catch(() => { }); }
        });

        const mimeType = CharonTabComponent.getBestVideoMimeType();
        const options: MediaRecorderOptions = { videoBitsPerSecond: VIDEO_BITS_PER_SECOND, audioBitsPerSecond: VIDEO_AUDIO_BITS_PER_SECOND };
        if (mimeType) options.mimeType = mimeType;
        this.videoRecorder = new MediaRecorder(stream, options);
        this.videoChunks = [];

        this.videoRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) this.videoChunks.push(e.data);
        };

        this.videoRecorder.onstop = () => {
            stream.getTracks().forEach(t => t.stop());
            this.videoStream = null;
            if (this.discardNextVideoStop) { this.discardNextVideoStop = false; return; }
            const actualMime = this.videoRecorder?.mimeType || mimeType || 'video/webm';
            void this.sendVideoRecording(actualMime);
        };

        this.videoRecorder.start(100);
        this.videoRecordingTimer = setInterval(() => {
            const next = this.recordingVideoSeconds() + 1;
            this.recordingVideoSeconds.set(next);
            if (next >= MAX_VIDEO_RECORDING_SECONDS) void this.stopVideoRecording();
        }, 1000);
    }

    private async stopVideoRecording(): Promise<void> {
        if (this.videoRecordingTimer !== null) {
            clearInterval(this.videoRecordingTimer);
            this.videoRecordingTimer = null;
        }
        this.recordingVideo.set(false);
        if (this.videoRecorder && this.videoRecorder.state !== 'inactive') {
            this.videoRecorder.stop();
        }
    }

    private async sendVideoRecording(mimeType: string): Promise<void> {
        const blob = new Blob(this.videoChunks, { type: mimeType });
        this.videoChunks = [];

        if (blob.size > MAX_FILE_SIZE) {
            this.fileTooLarge.set(true);
            setTimeout(() => this.fileTooLarge.set(false), 4000);
            return;
        }

        const listId = this.store.currentListId();
        const key = this.store.currentEncryptionKey();
        if (!listId || !key) return;

        const ext = CharonTabComponent.getVideoExtension(mimeType);
        const fileName = `video-${Date.now()}.${ext}`;

        this.sending.set(true);
        try {
            const dataUrl = await this.blobToDataUrl(blob);
            const senderName = this.prefs.senderName() || await firstValueFrom(this.translate.get('CHAT.ANONYMOUS'));
            const meta: CharonMeta = { fileName, mimeType, size: blob.size, senderName };

            const [content, metadata] = await Promise.all([
                this.crypto.encrypt(dataUrl, key),
                this.crypto.encrypt(JSON.stringify(meta), key),
            ]);

            await this.store.sendCharonDrop(
                content.ciphertext, content.iv,
                metadata.ciphertext, metadata.iv,
            );
            this.haptics.charonDropSent();
        } catch {
        } finally {
            this.sending.set(false);
        }
    }

    private static getBestVideoMimeType(): string {
        const candidates = [
            'video/webm;codecs=vp8,opus',
            'video/webm;codecs=vp9,opus',
            'video/webm',
            'video/mp4',
        ];
        for (const type of candidates) {
            if (MediaRecorder.isTypeSupported(type)) return type;
        }
        return '';
    }

    private static getVideoExtension(mimeType: string): string {
        if (mimeType.startsWith('video/webm')) return 'webm';
        if (mimeType.startsWith('video/mp4')) return 'mp4';
        return 'video';
    }

    private compressImage(file: File): Promise<string> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(reader.error ?? new Error('Could not read file'));
            reader.onload = () => {
                const img = new Image();
                img.onerror = () => reject(new Error('Invalid image file'));
                img.onload = () => {
                    let { width, height } = img;
                    if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
                        const scale = MAX_IMAGE_DIMENSION / Math.max(width, height);
                        width = Math.round(width * scale);
                        height = Math.round(height * scale);
                    }
                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    if (!ctx) { reject(new Error('Canvas unavailable')); return; }
                    ctx.drawImage(img, 0, 0, width, height);
                    resolve(canvas.toDataURL('image/jpeg', IMAGE_QUALITY));
                };
                img.src = reader.result as string;
            };
            reader.readAsDataURL(file);
        });
    }

    private readAsDataUrl(file: File): Promise<string> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(reader.error ?? new Error('Could not read file'));
            reader.onload = () => resolve(reader.result as string);
            reader.readAsDataURL(file);
        });
    }
}
