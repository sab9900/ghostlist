import { DatePipe } from '@angular/common';
import { Component, computed, effect, ElementRef, HostListener, inject, signal, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GhostChatMessage } from '../../../core/models';
import { CryptoService } from '../../../core/services/crypto.service';
import { HapticsService } from '../../../core/services/haptics.service';
import { UserPreferencesService } from '../../../core/services/user-preferences.service';
import { TranslatePipe } from '@ngx-translate/core';
import { AppStore } from '../../../store/app.store';

interface DecryptedMessage {
    id: string;
    text: string;
    senderName: string;
    createdAt: string;
    replyToMessageId: string | null;
    isImage: boolean;
}

const SWIPE_TRIGGER_DISTANCE = 56;
const SWIPE_MAX_DISTANCE = 72;
const SHOW_READ_RECEIPT_CHECKMARK = false;

@Component({
    selector: 'app-chat-tab',
    imports: [FormsModule, DatePipe, TranslatePipe],
    templateUrl: './chat-tab.component.html',
    styleUrl: './chat-tab.component.scss',
})
export class ChatTabComponent {
    protected readonly store = inject(AppStore);
    private readonly crypto = inject(CryptoService);
    protected readonly prefs = inject(UserPreferencesService);
    private readonly haptics = inject(HapticsService);

    @ViewChild('messageList') private messageListRef?: ElementRef<HTMLUListElement>;
    @ViewChild('fileInput') private fileInputRef?: ElementRef<HTMLInputElement>;
    @ViewChild('composeInput') private composeInputRef?: ElementRef<HTMLInputElement>;

    protected readonly newMessageText = signal('');
    protected readonly sendingMessage = signal(false);
    protected readonly sendingImage = signal(false);
    protected readonly decryptedMessages = signal<DecryptedMessage[]>([]);

    protected readonly replyingTo = signal<DecryptedMessage | null>(null);
    protected readonly openMenuId = signal<string | null>(null);
    protected readonly highlightedId = signal<string | null>(null);

    protected readonly showNameDialog = signal(false);
    protected readonly pendingName = signal('');

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

    protected readonly firstUnreadIndex = computed(() => {
        const id = this.store.currentListId();
        if (!id) return -1;
        const ts = this.store.messagesReadDivider()[id];
        if (!ts) return -1;
        const cutoff = new Date(ts).getTime();
        const idx = this.decryptedMessages().findIndex(
            m => new Date(m.createdAt).getTime() > cutoff,
        );
        return idx > 0 ? idx : -1;
    });

    private readonly othersLastRead = computed(() => {
        const id = this.store.currentListId();
        if (!id) return null;
        return this.store.othersLastReadMessageAt()[id] ?? null;
    });

    constructor() {
        if (!this.prefs.senderName()) {
            this.pendingName.set('');
            this.showNameDialog.set(true);
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
                        void this.store.markMessagesRead();
                    }, 1200);
                } else if (this._fullyOpened) {

                    this.scrollToBottom();
                    void this.store.markMessagesRead();
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

    private scrollToFirstUnreadOrBottom(): void {
        requestAnimationFrame(() => {
            const el = this.messageListRef?.nativeElement;
            if (!el) return;
            const divider = el.querySelector<HTMLElement>('.unread-divider');
            if (divider) {
                divider.scrollIntoView({ block: 'start' });
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
                } satisfies DecryptedMessage;
            }),
        );
        this.decryptedMessages.set(messages);
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
            void this.store.markMessagesRead();
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

        this.sendingImage.set(true);
        try {
            const dataUrl = await this.compressImage(file);
            const sender = this.prefs.senderName() || 'Anonymous';
            const replyId = this.replyingTo()?.id ?? null;
            await this.store.shareImage(dataUrl, sender, replyId);
            this.replyingTo.set(null);
            void this.store.markMessagesRead();
        } catch {
        } finally {
            this.sendingImage.set(false);
        }
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

    saveSenderName(): void {
        const name = this.pendingName().trim();
        if (!name) return;
        this.prefs.setSenderName(name);
        this.showNameDialog.set(false);
    }

    skipNameDialog(): void {
        this.showNameDialog.set(false);
    }
}
