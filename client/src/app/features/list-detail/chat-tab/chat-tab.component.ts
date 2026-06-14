import { DatePipe } from '@angular/common';
import { Component, computed, DestroyRef, effect, ElementRef, HostListener, inject, signal, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Capacitor } from '@capacitor/core';
import { Keyboard } from '@capacitor/keyboard';
import { GhostChatMessage } from '../../../core/models';
import { CryptoService } from '../../../core/services/crypto.service';
import { DeviceIdService } from '../../../core/services/device-id.service';
import { UserIdService } from '../../../core/services/user-id.service';
import { HapticsService } from '../../../core/services/haptics.service';
import { ImageViewerService } from '../../../core/services/image-viewer.service';
import { UserPreferencesService } from '../../../core/services/user-preferences.service';
import { TranslatePipe } from '@ngx-translate/core';
import { AppStore } from '../../../store/app.store';
import { ViewportDwellDirective } from '../../../core/directives/viewport-dwell.directive';
import { AvatarComponent } from '../../../shared/avatar/avatar.component';

interface DecryptedMessage {
    id: string;
    text: string;
    senderName: string;
    createdAt: string;
    replyToMessageId: string | null;
    isImage: boolean;
    senderDeviceId: string | null;
    senderUserId: string | null;
}

const SWIPE_TRIGGER_DISTANCE = 56;
const SWIPE_MAX_DISTANCE = 72;
const SHOW_READ_RECEIPT_CHECKMARK = false;

/**
 * Conservative raw-file size cap before compression — just a sanity check to
 * avoid hanging on huge originals. Compression to MAX_DIMENSION/JPEG quality
 * (see compressImage) brings nearly everything well under the server limit.
 */
const MAX_FILE_SIZE = 20 * 1024 * 1024;

/**
 * Cap on the compressed data URL length. The server limits EncryptedImage to
 * 3,500,000 base64 chars; AES-GCM ciphertext base64 adds ~4/3 on top of the
 * data URL's own size, so ~1.8M chars of data URL stays comfortably under.
 */
const MAX_DATA_URL_LENGTH = 1_800_000;

@Component({
    selector: 'app-chat-tab',
    imports: [FormsModule, DatePipe, TranslatePipe, ViewportDwellDirective, AvatarComponent],
    templateUrl: './chat-tab.component.html',
    styleUrl: './chat-tab.component.scss',
})
export class ChatTabComponent {
    protected readonly store = inject(AppStore);
    private readonly crypto = inject(CryptoService);
    protected readonly prefs = inject(UserPreferencesService);
    private readonly haptics = inject(HapticsService);
    protected readonly deviceId = inject(DeviceIdService);
    protected readonly userId = inject(UserIdService);
    private readonly imageViewer = inject(ImageViewerService);

    @ViewChild('messageList') private messageListRef?: ElementRef<HTMLUListElement>;
    @ViewChild('fileInput') private fileInputRef?: ElementRef<HTMLInputElement>;
    @ViewChild('composeInput') private composeInputRef?: ElementRef<HTMLInputElement>;

    protected readonly newMessageText = signal('');
    protected readonly sendingMessage = signal(false);
    protected readonly sendingImage = signal(false);
    protected readonly fileTooLarge = signal(false);
    protected readonly decryptedMessages = signal<DecryptedMessage[]>([]);

    protected readonly replyingTo = signal<DecryptedMessage | null>(null);
    protected readonly openMenuId = signal<string | null>(null);
    protected readonly highlightedId = signal<string | null>(null);

    protected readonly swipeTriggerDistance = SWIPE_TRIGGER_DISTANCE;
    protected readonly showReadReceiptCheckmark = SHOW_READ_RECEIPT_CHECKMARK;

    private _fullyOpened = false;
    private _firstDecryptDone = false;

    private swipeStartX = 0;
    private swipeStartY = 0;
    private swipeAxisLocked: 'x' | 'y' | null = null;
    protected readonly swipeState = signal<{ id: string; dx: number } | null>(null);

    private readonly messagesById = computed(() => {
        const map = new Map<string, DecryptedMessage>();
        for (const m of this.decryptedMessages()) map.set(m.id, m);
        return map;
    });

    private readonly unreadMessageIds = computed(() => {
        const id = this.store.currentListId();
        if (!id) return new Set<string>();
        return new Set(this.store.unreadMessageIds()[id] ?? []);
    });

    /** Whether this message hasn't been seen by this device yet (drives dwell-tracking). */
    protected isUnread(messageId: string): boolean {
        return this.unreadMessageIds().has(messageId);
    }

    /** Called once a message has been visible long enough to count as "read". */
    onMessageDwellRead(messageId: string): void {
        this.store.markMessageRead(messageId);
    }

    /**
     * Returns whether a message/item was sent by this person, based on the stable
     * `senderUserId` (preferred, survives machine sync) or `senderDeviceId` (legacy
     * fallback). Returns null if neither identifier is present on the row, in which
     * case callers should fall back to comparing display names.
     */
    protected isMineBySenderIds(senderUserId: string | null, senderDeviceId: string | null): boolean | null {
        if (senderUserId !== null) return senderUserId === this.userId.userId();
        if (senderDeviceId !== null) return senderDeviceId === this.deviceId.deviceId;
        return null;
    }

    private readonly othersLastRead = computed(() => {
        const id = this.store.currentListId();
        if (!id) return null;
        return this.store.othersLastReadMessageAt()[id] ?? null;
    });

    constructor() {
        if (Capacitor.isNativePlatform()) {
            // Start scrolling as soon as the keyboard *starts* animating in,
            // and keep pinning to the bottom for the duration of the
            // --keyboard-height CSS transition (200ms, see styles.scss).
            // This keeps the compose bar/last message in view throughout the
            // animation instead of jumping into place after the fact.
            const listener = Keyboard.addListener('keyboardWillShow', () => {
                this.scrollToBottomDuringTransition();
            });
            inject(DestroyRef).onDestroy(() => {
                void listener.then(handle => handle.remove());
            });
        }

        effect(() => {
            void this.store.messages();
            void this.decryptMessages().then(ok => {
                if (!ok) return;

                if (!this._firstDecryptDone) {

                    this._firstDecryptDone = true;
                    this.scrollToFirstUnreadOrBottom();
                    setTimeout(() => {
                        this._fullyOpened = true;
                    }, 1200);
                } else if (this._fullyOpened) {

                    this.scrollToBottom();
                }
            });
        });
    }

    private scrollToBottom(): void {
        requestAnimationFrame(() => {
            const el = this.messageListRef?.nativeElement;
            if (el) el.scrollTop = el.scrollHeight;
        });
    }

    /**
     * Pins the message list to the bottom on every frame while the keyboard
     * is animating in. As --keyboard-height transitions, the list's
     * clientHeight shrinks, so the "bottom" scroll offset keeps increasing;
     * re-applying scrollTop = scrollHeight each frame tracks that smoothly
     * instead of jumping once the animation has finished.
     */
    private scrollToBottomDuringTransition(): void {
        const el = this.messageListRef?.nativeElement;
        if (!el) return;

        const durationMs = 250; // matches padding-bottom transition + a small buffer
        const start = performance.now();

        const step = () => {
            el.scrollTop = el.scrollHeight;
            if (performance.now() - start < durationMs) {
                requestAnimationFrame(step);
            }
        };
        requestAnimationFrame(step);
    }

    private scrollToFirstUnreadOrBottom(): void {
        requestAnimationFrame(() => {
            const el = this.messageListRef?.nativeElement;
            if (!el) return;
            const firstUnread = el.querySelector<HTMLElement>('.message--unread');
            if (firstUnread) {
                firstUnread.scrollIntoView({ block: 'center' });
            } else {
                el.scrollTop = el.scrollHeight;
            }
        });
    }

    private async decryptMessages(): Promise<boolean> {
        const key = this.store.currentEncryptionKey();
        if (!key) return false;
        const messages = await Promise.all(
            this.store.messages().map(async (msg: GhostChatMessage) => {
                const text = await this.crypto.decrypt(msg.encryptedMessage, msg.messageInitializationVector, key);
                const senderName = await this.crypto.decrypt(msg.encryptedSenderName, msg.senderNameInitializationVector, key);
                let isImage = false;
                if (text.length < 100) {
                    try {
                        isImage = JSON.parse(text)?.type === 'image';
                    } catch { }
                }
                return {
                    id: msg.id,
                    text,
                    senderName,
                    createdAt: msg.createdAt,
                    replyToMessageId: msg.replyToMessageId,
                    isImage,
                    senderDeviceId: msg.senderDeviceId,
                    senderUserId: msg.senderUserId,
                } satisfies DecryptedMessage;
            }),
        );
        this.decryptedMessages.set(messages);

        const imageDataUrls = this.store.imageDataUrls();
        for (const msg of messages) {
            if (msg.isImage && !imageDataUrls[msg.id]) {
                void this.store.fetchAndCacheImage(msg.id);
            }
        }

        return true;
    }

    protected replyPreview(msg: DecryptedMessage): DecryptedMessage | null {
        if (!msg.replyToMessageId) return null;
        return this.messagesById().get(msg.replyToMessageId) ?? null;
    }

    protected isReadByOthers(msg: DecryptedMessage): boolean {
        const ts = this.othersLastRead();
        if (!ts) return false;
        return new Date(msg.createdAt).getTime() <= new Date(ts).getTime();
    }

    protected imageDataUrl(id: string): string | null {
        return this.store.imageDataUrls()[id] ?? null;
    }

    protected openImage(src: string, alt: string): void {
        this.imageViewer.open(src, alt);
    }

    protected swipeOffset(id: string): number {
        const state = this.swipeState();
        return state?.id === id ? state.dx : 0;
    }

    startReply(msg: DecryptedMessage): void {
        this.replyingTo.set(msg);
        this.openMenuId.set(null);
        requestAnimationFrame(() => this.composeInputRef?.nativeElement?.focus());
    }

    cancelReply(): void {
        this.replyingTo.set(null);
    }

    scrollToMessage(id: string): void {
        const el = this.messageListRef?.nativeElement?.querySelector<HTMLElement>(`[data-message-id="${id}"]`);
        if (!el) return;
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        this.highlightedId.set(id);
        setTimeout(() => {
            if (this.highlightedId() === id) this.highlightedId.set(null);
        }, 1400);
    }

    toggleMenu(id: string, event: Event): void {
        event.stopPropagation();
        this.openMenuId.set(this.openMenuId() === id ? null : id);
    }

    @HostListener('document:click')
    closeMenu(): void {
        this.openMenuId.set(null);
    }

    async copyMessage(msg: DecryptedMessage): Promise<void> {
        this.openMenuId.set(null);
        if (msg.isImage) return;
        try {
            await navigator.clipboard.writeText(msg.text);
        } catch { }
    }

    onTouchStart(event: TouchEvent, msg: DecryptedMessage): void {
        if (event.touches.length !== 1) return;
        this.swipeStartX = event.touches[0].clientX;
        this.swipeStartY = event.touches[0].clientY;
        this.swipeAxisLocked = null;
        this.swipeState.set({ id: msg.id, dx: 0 });
    }

    onTouchMove(event: TouchEvent, msg: DecryptedMessage): void {
        const state = this.swipeState();
        if (!state || state.id !== msg.id) return;

        const dx = event.touches[0].clientX - this.swipeStartX;
        const dy = event.touches[0].clientY - this.swipeStartY;

        if (!this.swipeAxisLocked) {
            if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
            this.swipeAxisLocked = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
        }
        if (this.swipeAxisLocked !== 'x') return;

        const clamped = Math.max(0, Math.min(dx, SWIPE_MAX_DISTANCE));
        if (clamped >= SWIPE_TRIGGER_DISTANCE && state.dx < SWIPE_TRIGGER_DISTANCE) {
            this.haptics.listTap();
        }
        this.swipeState.set({ id: msg.id, dx: clamped });
    }

    onTouchEnd(msg: DecryptedMessage): void {
        const state = this.swipeState();
        this.swipeAxisLocked = null;
        if (state && state.id === msg.id && state.dx >= SWIPE_TRIGGER_DISTANCE) {
            this.startReply(msg);
        }
        this.swipeState.set(null);
    }

    async sendMessage(): Promise<void> {
        const text = this.newMessageText().trim();
        const sender = this.prefs.senderName() || 'Anonymous';
        if (!text) return;
        (document.activeElement as HTMLElement)?.blur();
        this.sendingMessage.set(true);
        try {
            const replyId = this.replyingTo()?.id ?? null;
            await this.store.sendMessage(text, sender, replyId);
            this.newMessageText.set('');
            this.replyingTo.set(null);
        } finally {
            this.sendingMessage.set(false);
        }
    }

    async deleteMessage(id: string): Promise<void> {
        this.openMenuId.set(null);
        await this.store.deleteMessage(id);
    }

    pickImage(): void {
        this.fileInputRef?.nativeElement.click();
    }

    async onFileSelected(event: Event): Promise<void> {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        input.value = '';
        if (!file || !file.type.startsWith('image/')) return;

        if (file.size > MAX_FILE_SIZE) {
            this.showFileTooLarge();
            return;
        }

        this.sendingImage.set(true);
        try {
            const dataUrl = await this.compressImage(file);
            if (dataUrl.length > MAX_DATA_URL_LENGTH) {
                this.showFileTooLarge();
                return;
            }
            const sender = this.prefs.senderName() || 'Anonymous';
            const replyId = this.replyingTo()?.id ?? null;
            await this.store.shareImage(dataUrl, sender, replyId);
            this.replyingTo.set(null);
        } catch {
        } finally {
            this.sendingImage.set(false);
        }
    }

    private showFileTooLarge(): void {
        this.fileTooLarge.set(true);
        setTimeout(() => this.fileTooLarge.set(false), 4000);
    }

    private compressImage(file: File): Promise<string> {
        const MAX_DIMENSION = 1280;
        const QUALITY = 0.72;
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(reader.error ?? new Error('Could not read file'));
            reader.onload = () => {
                const img = new Image();
                img.onerror = () => reject(new Error('Invalid image file'));
                img.onload = () => {
                    let { width, height } = img;
                    if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
                        const scale = MAX_DIMENSION / Math.max(width, height);
                        width = Math.round(width * scale);
                        height = Math.round(height * scale);
                    }
                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    if (!ctx) { reject(new Error('Canvas unavailable')); return; }
                    ctx.drawImage(img, 0, 0, width, height);
                    resolve(canvas.toDataURL('image/jpeg', QUALITY));
                };
                img.src = reader.result as string;
            };
            reader.readAsDataURL(file);
        });
    }

}
