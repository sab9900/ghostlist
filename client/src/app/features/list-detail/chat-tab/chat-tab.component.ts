import { Component, ElementRef, HostListener, OnDestroy, computed, effect, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Clipboard } from '@capacitor/clipboard';
import { Capacitor } from '@capacitor/core';
import { Keyboard } from '@capacitor/keyboard';
import { TranslatePipe } from '@ngx-translate/core';
import { Subject, debounceTime } from 'rxjs';
import { HubService } from '../../../api/hub.service';
import { GhostChatMessage } from '../../../core/models';
import { CryptoService } from '../../../core/services/crypto.service';
import { DeviceIdService } from '../../../core/services/device-id.service';
import { HapticsService } from '../../../core/services/haptics.service';
import { ImageViewerService } from '../../../core/services/image-viewer.service';
import { KeyboardInsetService } from '../../../core/services/keyboard-inset.service';
import { NativeDownloadService } from '../../../core/services/native-download.service';
import { ShareHandlerService } from '../../../core/services/share-handler.service';
import { UserIdService } from '../../../core/services/user-id.service';
import { UserPreferencesService } from '../../../core/services/user-preferences.service';
import { ScrollToBottomButtonComponent } from '../../../shared/scroll-to-bottom-button/scroll-to-bottom-button.component';
import { VideoCaptureComponent, VideoCaptureResult } from '../../../shared/video-capture/video-capture.component';
import { AppStore } from '../../../store/app.store';
import { DecryptedMessage, ReplyPreview } from './chat-tab.types';
import { ChatComposeComponent } from './components/chat-compose/chat-compose.component';
import { ChatMessageComponent } from './components/chat-message/chat-message.component';
import { MentionListComponent } from './components/mention-list/mention-list.component';
import { ReplyBarComponent } from './components/reply-bar/reply-bar.component';

const SWIPE_TRIGGER_DISTANCE = 56;
const SWIPE_MAX_DISTANCE = 72;
const SHOW_READ_RECEIPT_CHECKMARK = true;
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const MAX_DATA_URL_LENGTH = 1_800_000;
const MAX_VIDEO_FILE_SIZE = 14 * 1024 * 1024;
const NEAR_BOTTOM_THRESHOLD = 120;
const NEAR_TOP_THRESHOLD = 120;
const KEYBOARD_DISMISS_DRAG_THRESHOLD = 32;
const KEYBOARD_DISMISS_GRACE_MS = 350;

@Component({
    selector: 'app-chat-tab',
    imports: [TranslatePipe, ChatMessageComponent, ReplyBarComponent, MentionListComponent, ChatComposeComponent, ScrollToBottomButtonComponent, VideoCaptureComponent],
    templateUrl: './chat-tab.component.html',
    styleUrl: './chat-tab.component.scss',
})
export class ChatTabComponent implements OnDestroy {
    protected readonly store = inject(AppStore);
    private readonly crypto = inject(CryptoService);
    protected readonly prefs = inject(UserPreferencesService);
    private readonly haptics = inject(HapticsService);
    protected readonly deviceId = inject(DeviceIdService);
    protected readonly userId = inject(UserIdService);
    private readonly imageViewer = inject(ImageViewerService);
    private readonly keyboardInset = inject(KeyboardInsetService);
    private readonly nativeDownload = inject(NativeDownloadService);
    private readonly hub = inject(HubService);
    private readonly shareHandler = inject(ShareHandlerService);

    private readonly messageListRef = viewChild<ElementRef<HTMLUListElement>>('messageList');
    private readonly composeRef = viewChild<ChatComposeComponent>('composeRef');

    private readonly isMobile = Capacitor.isNativePlatform() || window.matchMedia('(pointer: coarse)').matches;

    protected readonly newMessageText = signal('');
    protected readonly sendingMessage = signal(false);
    protected readonly sendingImage = signal(false);
    protected readonly sendingAudio = signal(false);
    protected readonly sendingVideo = signal(false);
    protected readonly fileTooLarge = signal(false);
    protected readonly recording = signal(false);
    protected readonly recordingSeconds = signal(0);
    protected readonly recordingNotSupported = signal(false);
    protected readonly recordingPermissionDenied = signal(false);
    protected readonly recordingDebugError = signal<string | null>(null);
    protected readonly videoRecordingNotSupported = signal(false);
    protected readonly videoRecordingDebugError = signal<string | null>(null);
    protected readonly showVideoCapture = signal(false);
    protected readonly decryptedMessages = signal<DecryptedMessage[]>([]);

    protected readonly typingNames = signal<string[]>([]);
    protected readonly mentionQuery = signal<string | null>(null);
    protected readonly mentionIndex = signal(0);

    private readonly typingInput$ = new Subject<void>();
    private readonly typingClearTimers = new Map<string, ReturnType<typeof setTimeout>>();

    private mediaRecorder: MediaRecorder | null = null;
    private audioChunks: Blob[] = [];
    private recordingTimer: ReturnType<typeof setInterval> | null = null;

    protected readonly replyingTo = signal<DecryptedMessage | null>(null);
    protected readonly openMenuId = signal<string | null>(null);
    protected readonly menuBelow = signal(false);
    protected readonly menuLeft = signal(false);
    protected readonly highlightedId = signal<string | null>(null);
    protected readonly showScrollToBottomButton = signal(false);
    protected readonly chatReady = signal(false);
    protected readonly loadingOlderMessages = computed(() => this.store.loadingOlderMessages());

    protected readonly swipeTriggerDistance = SWIPE_TRIGGER_DISTANCE;
    protected readonly showReadReceiptCheckmark = SHOW_READ_RECEIPT_CHECKMARK;

    private _fullyOpened = false;
    private _lastListId: string | null | undefined = undefined;
    private settleRafId: number | null = null;

    private swipeStartX = 0;
    private swipeStartY = 0;
    private swipeAxisLocked: 'x' | 'y' | null = null;
    protected readonly swipeState = signal<{ id: string; dx: number } | null>(null);

    private keyboardDismissTouchStartY: number | null = null;
    private keyboardOpenedAt = 0;
    private userTouchingList = false;
    private pendingScrollToBottomReason: 'own' | 'incoming' | null = null;
    private justSentOwnMessage = false;
    private decryptGeneration = 0;
    private isPaginating = false;

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

    protected isUnread(messageId: string): boolean { return this.unreadMessageIds().has(messageId); }

    onMessageDwellRead(messageId: string): void { this.store.markMessageRead(messageId); }

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

    private readonly otherMembers = computed(() => {
        const id = this.store.currentListId();
        if (!id) return [];
        return (this.store.cachedMembers()[id] ?? []).filter(m => !m.isCurrentDevice);
    });

    private readonly allMemberNames = computed(() => {
        const id = this.store.currentListId();
        if (!id) return [] as string[];
        return (this.store.cachedMembers()[id] ?? []).filter(m => !m.isCurrentDevice).map(m => m.displayName);
    });

    protected readonly mentionCandidates = computed(() => {
        const query = this.mentionQuery();
        if (query === null) return [] as string[];
        const lower = query.toLowerCase();
        return this.allMemberNames().filter(n => n.toLowerCase().startsWith(lower));
    });

    protected replyPreviewFor(msg: DecryptedMessage): ReplyPreview | null {
        if (!msg.replyToMessageId) return null;
        const src = this.messagesById().get(msg.replyToMessageId);
        if (!src) return null;
        return { senderName: src.senderName, text: src.text, isImage: src.isImage, isAudio: src.isAudio, isVideo: src.isVideo };
    }

    protected readReceiptStateFor(msg: DecryptedMessage): 'sent' | 'partial' | 'all' {
        const others = this.otherMembers();
        if (others.length === 0) return 'sent';
        const msgTime = new Date(msg.createdAt).getTime();
        const readCount = others.filter(m => m.lastReadMessageAt && new Date(m.lastReadMessageAt).getTime() >= msgTime).length;
        if (readCount === 0) return 'sent';
        if (readCount >= others.length) return 'all';
        return 'partial';
    }

    protected readersForMessage(msg: DecryptedMessage): { displayName: string }[] {
        const others = this.otherMembers();
        const msgTime = new Date(msg.createdAt).getTime();
        return others.filter(m => m.lastReadMessageAt && new Date(m.lastReadMessageAt).getTime() >= msgTime);
    }

    protected isMineFor(msg: DecryptedMessage): boolean {
        const byId = this.isMineBySenderIds(msg.senderUserId, msg.senderDeviceId);
        if (byId !== null) return byId;
        return msg.senderName === (this.prefs.senderName() || '');
    }

    protected swipeOffset(id: string): number {
        const state = this.swipeState();
        return state?.id === id ? state.dx : 0;
    }

    protected imageDataUrl(id: string): string | null { return this.store.imageDataUrls()[id] ?? null; }
    protected audioDataUrl(id: string): string | null { return this.store.audioDataUrls()[id] ?? null; }
    protected videoDataUrl(id: string): string | null { return this.store.videoDataUrls()[id] ?? null; }

    constructor() {
        this.keyboardInset.willShow$.pipe(takeUntilDestroyed()).subscribe(() => {
            this.keyboardOpenedAt = Date.now();
            this.scrollToBottomDuringTransition();
        });
        this.typingInput$.pipe(debounceTime(400), takeUntilDestroyed()).subscribe(() => {
            void this.sendTypingNotification();
        });
        this.hub.typingIndicator$.pipe(takeUntilDestroyed()).subscribe(async event => {
            const listId = this.store.currentListId();
            if (event.listId !== listId) return;
            const key = this.store.currentEncryptionKey();
            if (!key) return;
            const name = await this.crypto.decrypt(event.encryptedName, event.nameIv, key);
            this.typingNames.update(names => names.includes(name) ? names : [...names, name]);
            const existing = this.typingClearTimers.get(name);
            if (existing !== undefined) clearTimeout(existing);
            this.typingClearTimers.set(name, setTimeout(() => {
                this.typingNames.update(names => names.filter(n => n !== name));
                this.typingClearTimers.delete(name);
            }, 3000));
        });
        effect(() => {
            const payload = this.shareHandler.pendingPayload();
            if (!payload || !payload.confirmed || payload.target !== 'chat') return;
            const file = payload.files[0];
            if (file) {
                this.shareHandler.consume();
                void this.sendSharedFile(file);
            }
        });

        effect(() => {
            const id = this.store.currentListId();
            if (id !== this._lastListId) {
                this._lastListId = id;
                this.resetSettleState();
            }
        });

        effect(() => {
            void this.store.messages();
            void this.store.currentListSynced();
            void this.decryptMessages().then(ok => {
                if (!ok) return;
                if (!this._fullyOpened) this.startSettleLoop();
                else this.handleMessageListChanged();
            });
        });
    }

    private handleMessageListChanged(): void {
        const ownMessage = this.justSentOwnMessage;
        this.justSentOwnMessage = false;

        const deferred = this.userTouchingList || this.isPaginating;

        if (ownMessage) {
            if (deferred) this.pendingScrollToBottomReason = 'own';
            else this.scrollToBottom('smooth');
            return;
        }

        if (deferred) {
            if (this.isNearBottom()) this.pendingScrollToBottomReason = 'incoming';
            return;
        }

        if (this.isNearBottom()) this.scrollToBottom('smooth');
        else this.updateScrollButtonVisibility();
    }

    private resolvePendingScroll(): void {
        const reason = this.pendingScrollToBottomReason;
        this.pendingScrollToBottomReason = null;
        if (reason === 'own') this.scrollToBottom('smooth');
        else if (reason === 'incoming' && this.isNearBottom()) this.scrollToBottom('smooth');
        else this.updateScrollButtonVisibility();
    }

    protected onMessageListScroll(): void {
        this.updateScrollButtonVisibility();
        this.maybeLoadOlderMessages();
    }

    private isNearTop(): boolean {
        const el = this.messageListRef()?.nativeElement;
        if (!el) return false;
        return el.scrollTop <= NEAR_TOP_THRESHOLD;
    }

    private maybeLoadOlderMessages(): void {
        if (!this.chatReady()) return;
        if (this.store.loadingOlderMessages() || !this.store.messagesHasMore()) return;
        if (!this.isNearTop()) return;
        void this.loadOlderMessagesPreservingScroll();
    }

    private async loadOlderMessagesPreservingScroll(): Promise<void> {
        const el = this.messageListRef()?.nativeElement;
        if (!el) return;
        const prevScrollHeight = el.scrollHeight;
        const prevScrollTop = el.scrollTop;
        this.isPaginating = true;
        try {
            await this.store.loadOlderMessages();
            await this.decryptMessages();

            requestAnimationFrame(() => {
                const target = this.messageListRef()?.nativeElement;
                if (!target) return;
                const delta = target.scrollHeight - prevScrollHeight;
                target.scrollTop = prevScrollTop + delta;
            });
        } finally {
            this.isPaginating = false;
            if (!this.userTouchingList) this.resolvePendingScroll();
        }
    }

    protected onMessageListTouchStart(event: TouchEvent): void {
        this.userTouchingList = true;
        this.keyboardDismissTouchStartY = event.touches.length === 1 ? event.touches[0].clientY : null;
    }

    protected onMessageListTouchMove(event: TouchEvent): void {
        const startY = this.keyboardDismissTouchStartY;
        if (startY === null || event.touches.length !== 1) return;
        if (!this.isMobile || !this.chatReady() || this.keyboardInset.height() === 0) return;
        if (Date.now() - this.keyboardOpenedAt < KEYBOARD_DISMISS_GRACE_MS) return;
        const dy = event.touches[0].clientY - startY;
        if (dy > KEYBOARD_DISMISS_DRAG_THRESHOLD) {
            this.keyboardDismissTouchStartY = null;
            this.dismissKeyboard();
        }
    }

    protected onMessageListTouchEnd(): void {
        this.keyboardDismissTouchStartY = null;
        this.userTouchingList = false;
        if (!this.isPaginating) this.resolvePendingScroll();
    }

    private dismissKeyboard(): void {
        const active = document.activeElement as HTMLElement | null;
        if (active && (active.tagName === 'TEXTAREA' || active.tagName === 'INPUT')) active.blur();
        if (Capacitor.isNativePlatform()) void Keyboard.hide();
        this.mentionQuery.set(null);
    }

    private scrollToBottom(behavior: ScrollBehavior): void {
        this.showScrollToBottomButton.set(false);
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                const el = this.messageListRef()?.nativeElement;
                if (el) el.scrollTo({ top: el.scrollHeight, behavior });
            });
        });
    }

    protected onScrollToBottomClick(): void {
        const el = this.messageListRef()?.nativeElement;
        if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
        this.showScrollToBottomButton.set(false);
        this.haptics.scrollToBottom();
    }

    private isNearBottom(): boolean {
        const el = this.messageListRef()?.nativeElement;
        if (!el) return true;
        return el.scrollHeight - el.scrollTop - el.clientHeight <= NEAR_BOTTOM_THRESHOLD;
    }

    private updateScrollButtonVisibility(): void {
        this.showScrollToBottomButton.set(!this.isNearBottom());
    }

    private scrollToBottomDuringTransition(): void {
        const el = this.messageListRef()?.nativeElement;
        if (!el) return;
        const durationMs = 250;
        const start = performance.now();
        const step = () => {
            el.scrollTop = el.scrollHeight;
            if (performance.now() - start < durationMs) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    }

    private resetSettleState(): void {
        if (this.settleRafId !== null) {
            cancelAnimationFrame(this.settleRafId);
            this.settleRafId = null;
        }
        this._fullyOpened = false;
        this.chatReady.set(false);
        this.keyboardDismissTouchStartY = null;
        this.userTouchingList = false;
        this.pendingScrollToBottomReason = null;
        this.justSentOwnMessage = false;
        this.isPaginating = false;
    }

    private snapToTargetInstant(el: HTMLElement): void {
        const firstUnread = el.querySelector<HTMLElement>('.message--unread');
        if (firstUnread) {
            const elRect = el.getBoundingClientRect();
            const targetRect = firstUnread.getBoundingClientRect();
            const offset = (targetRect.top - elRect.top) - (el.clientHeight - firstUnread.clientHeight) / 2;
            const max = Math.max(0, el.scrollHeight - el.clientHeight);
            el.scrollTop = Math.max(0, Math.min(el.scrollTop + offset, max));
        } else {
            el.scrollTop = el.scrollHeight;
        }
    }

    private startSettleLoop(): void {
        if (this.settleRafId !== null) return;
        let lastHeight = -1;
        let stableSinceMs = 0;
        let startedAtMs = 0;
        const STABLE_MS = 220;
        const MIN_MS = 120;
        const MAX_MS = 2500;
        const tick = (now: number) => {
            if (startedAtMs === 0) { startedAtMs = now; stableSinceMs = now; }
            const el = this.messageListRef()?.nativeElement;
            if (el) {
                this.snapToTargetInstant(el);
                const h = el.scrollHeight;
                if (h !== lastHeight) { lastHeight = h; stableSinceMs = now; }
            }
            const elapsed = now - startedAtMs;
            const stableFor = now - stableSinceMs;
            const synced = this.store.currentListSynced();
            const settled = (synced && stableFor >= STABLE_MS && elapsed >= MIN_MS) || elapsed >= MAX_MS;
            if (settled) {
                this.settleRafId = null;
                this._fullyOpened = true;
                this.chatReady.set(true);
                return;
            }
            this.settleRafId = requestAnimationFrame(tick);
        };
        this.settleRafId = requestAnimationFrame(tick);
    }

    private async decryptMessages(): Promise<boolean> {
        const key = this.store.currentEncryptionKey();
        if (!key) return false;
        const generation = ++this.decryptGeneration;
        const messages = await Promise.all(
            this.store.messages().map(async (msg: GhostChatMessage) => {
                const text = await this.crypto.decrypt(msg.encryptedMessage, msg.messageInitializationVector, key);
                const senderName = await this.crypto.decrypt(msg.encryptedSenderName, msg.senderNameInitializationVector, key);
                let isImage = false; let isAudio = false; let isVideo = false;
                if (text.length < 100) {
                    try {
                        const parsed = JSON.parse(text);
                        isImage = parsed?.type === 'image';
                        isAudio = parsed?.type === 'audio';
                        isVideo = parsed?.type === 'video';
                    } catch { }
                }
                return { id: msg.id, text, senderName, createdAt: msg.createdAt, replyToMessageId: msg.replyToMessageId, isImage, isAudio, isVideo, senderDeviceId: msg.senderDeviceId, senderUserId: msg.senderUserId } satisfies DecryptedMessage;
            }),
        );
        if (generation !== this.decryptGeneration) return false;
        this.decryptedMessages.set(messages);
        const imageDataUrls = this.store.imageDataUrls();
        const audioDataUrls = this.store.audioDataUrls();
        const videoDataUrls = this.store.videoDataUrls();
        for (const msg of messages) {
            if (msg.isImage && !imageDataUrls[msg.id]) void this.store.fetchAndCacheImage(msg.id);
            if (msg.isAudio && !audioDataUrls[msg.id]) void this.store.fetchAndCacheAudio(msg.id);
            if (msg.isVideo && !videoDataUrls[msg.id]) void this.store.fetchAndCacheVideo(msg.id);
        }
        return true;
    }

    startReply(msg: DecryptedMessage): void {
        this.replyingTo.set(msg);
        this.openMenuId.set(null);
        requestAnimationFrame(() => this.composeRef()?.focusInput());
    }

    cancelReply(): void { this.replyingTo.set(null); }

    scrollToMessage(id: string): void {
        const el = this.messageListRef()?.nativeElement?.querySelector<HTMLElement>(`[data-message-id="${id}"]`);
        if (!el) return;
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        this.highlightedId.set(id);
        setTimeout(() => { if (this.highlightedId() === id) this.highlightedId.set(null); }, 1400);
    }

    toggleMenu(id: string, event: MouseEvent): void {
        event.stopPropagation();
        if (this.openMenuId() === id) { this.openMenuId.set(null); return; }
        const btn = event.currentTarget as HTMLElement;
        const rect = btn.getBoundingClientRect();
        const container = btn.closest('.message-list');
        const containerTop = container ? container.getBoundingClientRect().top : 0;
        this.menuBelow.set(rect.top - containerTop < 160);
        this.menuLeft.set(rect.left < 160);
        this.openMenuId.set(id);
    }

    @HostListener('document:click')
    closeMenu(): void { this.openMenuId.set(null); }

    async copyMessage(msg: DecryptedMessage): Promise<void> {
        this.openMenuId.set(null);
        if (msg.isImage) return;
        try { await Clipboard.write({ string: msg.text }); } catch { }
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
        if (clamped >= SWIPE_TRIGGER_DISTANCE && state.dx < SWIPE_TRIGGER_DISTANCE) this.haptics.listTap();
        this.swipeState.set({ id: msg.id, dx: clamped });
    }

    onTouchEnd(msg: DecryptedMessage): void {
        const state = this.swipeState();
        this.swipeAxisLocked = null;
        if (state && state.id === msg.id && state.dx >= SWIPE_TRIGGER_DISTANCE) this.startReply(msg);
        this.swipeState.set(null);
    }

    onKeydown(event: KeyboardEvent): void {
        if (this.mentionQuery() !== null) {
            if (event.key === 'ArrowDown') { event.preventDefault(); this.mentionIndex.update(i => Math.min(i + 1, this.mentionCandidates().length - 1)); return; }
            if (event.key === 'ArrowUp') { event.preventDefault(); this.mentionIndex.update(i => Math.max(i - 1, 0)); return; }
            if (event.key === 'Enter' || event.key === 'Tab') {
                const candidate = this.mentionCandidates()[this.mentionIndex()];
                if (candidate) { event.preventDefault(); this.insertMention(candidate); return; }
            }
            if (event.key === 'Escape') { this.mentionQuery.set(null); return; }
        }
        if (this.isMobile) return;
        if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void this.sendMessage(); }
    }

    onTextChange(value: string): void {
        this.newMessageText.set(value);
        const el = this.composeRef()?.textarea()?.nativeElement;
        if (el) this.updateMentionQuery(el);
        this.typingInput$.next();
    }

    private updateMentionQuery(el: HTMLTextAreaElement): void {
        const pos = el.selectionStart ?? 0;
        const before = el.value.slice(0, pos);
        const match = before.match(/(?:^|(?<=\s))@(\w*)$/);
        if (match) { this.mentionQuery.set(match[1]); this.mentionIndex.set(0); }
        else this.mentionQuery.set(null);
    }

    insertMention(name: string): void {
        const el = this.composeRef()?.textarea()?.nativeElement;
        if (!el) return;
        const pos = el.selectionStart ?? 0;
        const value = el.value;
        const before = value.slice(0, pos);
        const after = value.slice(pos);
        const replaced = before.replace(/(?:^|(?<=\s))@\w*$/, (m) => {
            const prefix = m.startsWith('@') ? '' : m.slice(0, m.indexOf('@'));
            return prefix + '@' + name + ' ';
        });
        const newValue = replaced + after;
        this.newMessageText.set(newValue);
        this.mentionQuery.set(null);
        requestAnimationFrame(() => { el.setSelectionRange(replaced.length, replaced.length); el.focus(); });
    }

    private async sendTypingNotification(): Promise<void> {
        const listId = this.store.currentListId();
        const key = this.store.currentEncryptionKey();
        const senderName = this.prefs.senderName() || 'Anonymous';
        if (!listId || !key) return;
        const { ciphertext, iv } = await this.crypto.encrypt(senderName, key);
        await this.hub.notifyTyping(listId, ciphertext, iv);
    }

    async sendMessage(): Promise<void> {
        const text = this.newMessageText().trim();
        const sender = this.prefs.senderName() || 'Anonymous';
        if (!text) return;
        this.haptics.messageSent();
        this.sendingMessage.set(true);
        try {
            const replyId = this.replyingTo()?.id ?? null;
            this.justSentOwnMessage = true;
            await this.store.sendMessage(text, sender, replyId);
            this.newMessageText.set('');
            this.replyingTo.set(null);
        } catch (err) {
            this.justSentOwnMessage = false;
            throw err;
        } finally {
            this.sendingMessage.set(false);
            const el = this.composeRef()?.textarea()?.nativeElement;
            if (el) el.style.height = 'auto';
        }
    }

    async deleteMessage(id: string): Promise<void> {
        this.openMenuId.set(null);
        await this.store.deleteMessage(id);
    }

    async downloadMedia(msg: DecryptedMessage): Promise<void> {
        this.openMenuId.set(null);
        const url = msg.isAudio ? this.audioDataUrl(msg.id) : msg.isVideo ? this.videoDataUrl(msg.id) : null;
        if (!url) return;
        const fileName = msg.isAudio ? `ghostlist-voice-${msg.id}` : `ghostlist-video-${msg.id}`;
        try {
            await this.nativeDownload.downloadUrl(url, fileName);
        } catch { }
    }

    openImage(url: string, alt: string): void { this.imageViewer.open(url, alt); }

    pickImage(): void { this.composeRef()?.fileInput()?.nativeElement.click(); }

    async onFileSelected(event: Event): Promise<void> {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        input.value = '';
        if (!file || !file.type.startsWith('image/')) return;
        if (file.size > MAX_FILE_SIZE) { this.showFileTooLarge(); return; }
        this.sendingImage.set(true);
        try {
            const dataUrl = await this.compressImage(file);
            if (dataUrl.length > MAX_DATA_URL_LENGTH) { this.showFileTooLarge(); return; }
            const sender = this.prefs.senderName() || 'Anonymous';
            const replyId = this.replyingTo()?.id ?? null;
            this.haptics.messageSent();
            this.justSentOwnMessage = true;
            await this.store.shareImage(dataUrl, sender, replyId);
            this.replyingTo.set(null);
        } catch {
            this.justSentOwnMessage = false;
        } finally { this.sendingImage.set(false); }
    }

    async sendSharedFile(file: File): Promise<void> {
        if (file.type.startsWith('image/')) {
            await this.sendSharedImage(file);
        } else if (file.type.startsWith('audio/')) {
            await this.sendSharedAudio(file);
        } else if (file.type.startsWith('video/')) {
            await this.sendSharedVideo(file);
        }
    }

    private async sendSharedImage(file: File): Promise<void> {
        if (file.size > MAX_FILE_SIZE) { this.showFileTooLarge(); return; }
        this.sendingImage.set(true);
        try {
            const dataUrl = await this.compressImage(file);
            if (dataUrl.length > MAX_DATA_URL_LENGTH) { this.showFileTooLarge(); return; }
            const sender = this.prefs.senderName() || 'Anonymous';
            this.haptics.messageSent();
            this.justSentOwnMessage = true;
            await this.store.shareImage(dataUrl, sender, null);
        } catch {
            this.justSentOwnMessage = false;
        } finally { this.sendingImage.set(false); }
    }

    private async sendSharedAudio(file: File): Promise<void> {
        if (file.size > MAX_FILE_SIZE) { this.showFileTooLarge(); return; }
        this.sendingAudio.set(true);
        try {
            const dataUrl = await this.readAsDataUrl(file);
            if (dataUrl.length > MAX_DATA_URL_LENGTH) { this.showFileTooLarge(); return; }
            const sender = this.prefs.senderName() || 'Anonymous';
            this.haptics.messageSent();
            this.justSentOwnMessage = true;
            await this.store.shareAudio(dataUrl, sender, null);
        } catch {
            this.justSentOwnMessage = false;
        } finally { this.sendingAudio.set(false); }
    }

    private async sendSharedVideo(file: File): Promise<void> {
        if (file.size > MAX_VIDEO_FILE_SIZE) { this.showFileTooLarge(); return; }
        this.sendingVideo.set(true);
        try {
            const dataUrl = await this.readAsDataUrl(file);
            const sender = this.prefs.senderName() || 'Anonymous';
            this.haptics.messageSent();
            this.justSentOwnMessage = true;
            await this.store.shareVideo(dataUrl, sender, null);
        } catch {
            this.justSentOwnMessage = false;
        } finally { this.sendingVideo.set(false); }
    }

    private readAsDataUrl(file: File): Promise<string> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(reader.error ?? new Error('Could not read file'));
            reader.onload = () => resolve(reader.result as string);
            reader.readAsDataURL(file);
        });
    }

    private showFileTooLarge(): void {
        this.fileTooLarge.set(true);
        setTimeout(() => this.fileTooLarge.set(false), 4000);
    }

    private compressImage(file: File): Promise<string> {
        const MAX_DIMENSION = 1280; const QUALITY = 0.72;
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
                        width = Math.round(width * scale); height = Math.round(height * scale);
                    }
                    const canvas = document.createElement('canvas');
                    canvas.width = width; canvas.height = height;
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

    async toggleRecording(): Promise<void> {
        if (this.recording()) { this.haptics.messageSent(); await this.stopRecording(); }
        else await this.startRecording();
    }

    private async startRecording(): Promise<void> {
        if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
            const reason = !navigator.mediaDevices ? 'mediaDevices undefined' : !navigator.mediaDevices.getUserMedia ? 'getUserMedia undefined' : 'MediaRecorder undefined';
            this.recordingDebugError.set(reason); this.recordingNotSupported.set(true);
            setTimeout(() => { this.recordingNotSupported.set(false); this.recordingDebugError.set(null); }, 8000);
            return;
        }
        let stream: MediaStream;
        try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
        catch (err) {
            if (err instanceof DOMException && err.name === 'NotAllowedError') {
                this.recordingPermissionDenied.set(true);
                setTimeout(() => this.recordingPermissionDenied.set(false), 5000);
            } else {
                const errName = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
                this.recordingDebugError.set(errName); this.recordingNotSupported.set(true);
                setTimeout(() => { this.recordingNotSupported.set(false); this.recordingDebugError.set(null); }, 8000);
            }
            return;
        }
        const mimeType = ChatTabComponent.getBestAudioMimeType();
        this.mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        this.audioChunks = [];
        this.mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) this.audioChunks.push(e.data); };
        this.mediaRecorder.onstop = () => {
            stream.getTracks().forEach(t => t.stop());
            const actualMime = this.mediaRecorder?.mimeType || mimeType || 'audio/webm';
            void this.sendAudioMessage(actualMime);
        };
        this.mediaRecorder.start(100);
        this.recording.set(true); this.recordingSeconds.set(0);
        this.recordingTimer = setInterval(() => {
            const next = this.recordingSeconds() + 1;
            this.recordingSeconds.set(next);
            if (next >= 120) void this.stopRecording();
        }, 1000);
    }

    private async stopRecording(): Promise<void> {
        if (this.recordingTimer !== null) { clearInterval(this.recordingTimer); this.recordingTimer = null; }
        this.recording.set(false);
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') this.mediaRecorder.stop();
    }

    private async sendAudioMessage(mimeType: string): Promise<void> {
        const blob = new Blob(this.audioChunks, { type: mimeType }); this.audioChunks = [];
        const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(reader.error ?? new Error('Could not read audio blob'));
            reader.onload = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
        });
        const sender = this.prefs.senderName() || 'Anonymous';
        const replyId = this.replyingTo()?.id ?? null;
        this.sendingAudio.set(true);
        try { this.haptics.messageSent(); this.justSentOwnMessage = true; await this.store.shareAudio(dataUrl, sender, replyId); this.replyingTo.set(null); }
        catch { this.justSentOwnMessage = false; } finally { this.sendingAudio.set(false); }
    }

    private static getBestAudioMimeType(): string {
        const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/ogg'];
        for (const type of candidates) { if (MediaRecorder.isTypeSupported(type)) return type; }
        return '';
    }

    openVideoCapture(): void {
        if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
            const reason = !navigator.mediaDevices ? 'mediaDevices undefined' : !navigator.mediaDevices.getUserMedia ? 'getUserMedia undefined' : 'MediaRecorder undefined';
            this.videoRecordingDebugError.set(reason); this.videoRecordingNotSupported.set(true);
            setTimeout(() => { this.videoRecordingNotSupported.set(false); this.videoRecordingDebugError.set(null); }, 8000);
            return;
        }
        this.showVideoCapture.set(true);
    }

    closeVideoCapture(): void {
        this.showVideoCapture.set(false);
    }

    async onVideoCaptured(result: VideoCaptureResult): Promise<void> {
        this.showVideoCapture.set(false);
        await this.sendVideoMessage(result.blob, result.mimeType);
    }

    private async sendVideoMessage(blob: Blob, mimeType: string): Promise<void> {
        if (blob.size > MAX_VIDEO_FILE_SIZE) { this.showFileTooLarge(); return; }
        const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(reader.error ?? new Error('Could not read video blob'));
            reader.onload = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
        });
        void mimeType;
        const sender = this.prefs.senderName() || 'Anonymous';
        const replyId = this.replyingTo()?.id ?? null;
        this.sendingVideo.set(true);
        try { this.haptics.messageSent(); this.justSentOwnMessage = true; await this.store.shareVideo(dataUrl, sender, replyId); this.replyingTo.set(null); }
        catch (err) {
            this.justSentOwnMessage = false;
            const errName = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
            this.videoRecordingDebugError.set(errName); this.videoRecordingNotSupported.set(true);
            setTimeout(() => { this.videoRecordingNotSupported.set(false); this.videoRecordingDebugError.set(null); }, 8000);
        } finally { this.sendingVideo.set(false); }
    }

    ngOnDestroy(): void {
        if (this.recordingTimer !== null) clearInterval(this.recordingTimer);
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') this.mediaRecorder.stop();
        this.typingClearTimers.forEach(t => clearTimeout(t));
        if (this.settleRafId !== null) cancelAnimationFrame(this.settleRafId);
    }
}
