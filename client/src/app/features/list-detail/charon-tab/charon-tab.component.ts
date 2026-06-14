import { Component, effect, ElementRef, inject, signal, untracked, ViewChild } from '@angular/core';
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

/** Decrypted metadata for a sealed drop (filename/type/size + sender display name). */
interface CharonMeta {
    fileName: string;
    mimeType: string;
    size: number;
    senderName: string;
}

/** A fully-decrypted drop, kept in this device's session only after burning. */
interface RevealedDrop {
    id: string;
    dataUrl: string;
    fileName: string;
    mimeType: string;
    size: number;
    senderName: string;
    isImage: boolean;
}

/**
 * Conservative raw-file size cap. The server limits EncryptedContent to
 * 15,000,000 base64 chars; a data URL is ~4/3 the raw size, and AES-GCM
 * ciphertext base64 adds another ~4/3, so ~8 MB raw stays comfortably under.
 */
const MAX_FILE_SIZE = 8 * 1024 * 1024;

const MAX_IMAGE_DIMENSION = 1280;
const IMAGE_QUALITY = 0.72;

/**
 * Allowed file extensions for Charon drops. Everything sent through Charon is
 * end-to-end encrypted, so the server can never scan its contents — this
 * allowlist is the main safeguard against sharing executables/scripts that a
 * recipient could be tricked into running.
 */
const ALLOWED_EXTENSIONS = new Set([
    // Images
    'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'heic', 'heif',
    // Documents
    'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp', 'txt', 'rtf', 'csv',
    // Audio / video
    'mp3', 'wav', 'm4a', 'ogg', 'flac', 'mp4', 'mov', 'webm', 'avi',
    // Archives
    'zip',
]);

function isAllowedFile(file: File): boolean {
    const ext = file.name.split('.').pop()?.toLowerCase();
    return !!ext && ALLOWED_EXTENSIONS.has(ext);
}

@Component({
    selector: 'app-charon-tab',
    imports: [TranslatePipe],
    templateUrl: './charon-tab.component.html',
    styleUrl: './charon-tab.component.scss',
})
export class CharonTabComponent {
    protected readonly store = inject(AppStore);
    protected readonly prefs = inject(UserPreferencesService);
    protected readonly deviceId = inject(DeviceIdService);
    protected readonly userId = inject(UserIdService);
    private readonly crypto = inject(CryptoService);
    private readonly haptics = inject(HapticsService);
    private readonly translate = inject(TranslateService);
    private readonly imageViewer = inject(ImageViewerService);

    @ViewChild('fileInput') private fileInputRef?: ElementRef<HTMLInputElement>;

    /** Decrypted metadata for sealed drops, keyed by drop id. */
    protected readonly dropMeta = signal<Map<string, CharonMeta>>(new Map());
    /** Drops this device has revealed (and burned) this session. */
    protected readonly revealedDrops = signal<RevealedDrop[]>([]);
    protected readonly sending = signal(false);
    protected readonly fileTooLarge = signal(false);
    protected readonly fileTypeNotAllowed = signal(false);

    constructor() {
        effect(() => {
            const drops = this.store.charonDrops();
            void this.decryptNewMeta(drops);
        });
    }

    /** Decrypts metadata (filename/size/sender) for any drops not seen before. Does not burn the drop. */
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

    /** Whether this device/user sent the drop (mirrors AppStore.isOwnSender). */
    protected isMine(drop: CharonDropDto): boolean {
        if (drop.senderUserId !== null) return drop.senderUserId === this.userId.userId();
        if (drop.senderDeviceId !== null) return drop.senderDeviceId === this.deviceId.deviceId;
        return false;
    }

    protected isImageMime(mimeType: string | undefined): boolean {
        return !!mimeType?.startsWith('image/');
    }

    protected formatSize(bytes: number): string {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }

    protected openImage(src: string, alt: string): void {
        this.imageViewer.open(src, alt);
    }

    /** Decrypts the full content of a drop, shows it, and burns it (marks viewed). One-shot, with confirmation. */
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

            this.revealedDrops.update(list => [...list, {
                id: drop.id,
                dataUrl,
                fileName: meta!.fileName,
                mimeType: meta!.mimeType,
                size: meta!.size,
                senderName: meta!.senderName,
                isImage: this.isImageMime(meta!.mimeType),
            }]);
        } catch {
            return;
        }

        await this.store.viewCharonDrop(drop.id);
    }

    /** Clears a revealed drop from this device's local session view. */
    dismiss(id: string): void {
        this.revealedDrops.update(list => list.filter(d => d.id !== id));
    }

    /** Deletes a not-yet-fully-viewed drop for everyone (only available to its sender). */
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
            this.haptics.itemAdded();
        } catch {
        } finally {
            this.sending.set(false);
        }
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
