import { Component, effect, ElementRef, inject, OnDestroy, signal, untracked, ViewChild } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';
import { CharonDropDto } from '../../../core/models';
import { CryptoService } from '../../../core/services/crypto.service';
import { DeviceIdService } from '../../../core/services/device-id.service';
import { HapticsService } from '../../../core/services/haptics.service';
import { ImageViewerService } from '../../../core/services/image-viewer.service';
import { UserIdService } from '../../../core/services/user-id.service';
import { UserPreferencesService } from '../../../core/services/user-preferences.service';
import { AppStore } from '../../../store/app.store';
import { AudioWaveformPlayerComponent } from '../../../shared/audio-waveform-player/audio-waveform-player.component';

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
}

const MAX_FILE_SIZE = 8 * 1024 * 1024;

const MAX_IMAGE_DIMENSION = 1280;
const IMAGE_QUALITY = 0.72;

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
    imports: [TranslatePipe, AudioWaveformPlayerComponent],
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

    private mediaRecorder: MediaRecorder | null = null;
    private audioChunks: Blob[] = [];
    private recordingTimer: ReturnType<typeof setInterval> | null = null;

    private readonly blobUrls = new Map<string, string>();

    constructor() {
        effect(() => {
            const drops = this.store.charonDrops();
            void this.decryptNewMeta(drops);
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
            let srcUrl = dataUrl;
            if (isAudio) {
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

        if (!isAllowedFile(file)) {
            this.fileTypeNotAllowed.set(true);
            setTimeout(() => this.fileTypeNotAllowed.set(false), 4000);
            return;
        }

        if (file.size > MAX_FILE_SIZE) {
            this.fileTooLarge.set(true);
            setTimeout(() => this.fileTooLarge.set(false), 4000);
            return;
        }

        const listId = this.store.currentListId();
        const key = this.store.currentEncryptionKey();
        if (!listId || !key) return;

        this.sending.set(true);
        try {
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
        } catch {
        } finally {
            this.sending.set(false);
        }
    }

    ngOnDestroy(): void {
        if (this.recordingTimer !== null) clearInterval(this.recordingTimer);
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') this.mediaRecorder.stop();
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
