import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, ElementRef, ViewChild, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Capacitor } from '@capacitor/core';
import { LucideEye } from "@lucide/angular";
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../../api/api.service';
import { HubService } from '../../../api/hub.service';
import { ListMember, WhisperPresenceEntry } from '../../../core/models';
import { CryptoService } from '../../../core/services/crypto.service';
import { DeviceIdService } from '../../../core/services/device-id.service';
import { HapticsService } from '../../../core/services/haptics.service';
import { KeyboardInsetService } from '../../../core/services/keyboard-inset.service';
import { UserPreferencesService } from '../../../core/services/user-preferences.service';
import { AppStore } from '../../../store/app.store';

interface Whisper {
    id: string;
    text: string;
    senderName: string;
    mine: boolean;
    fading: boolean;
}

const WHISPER_LIFETIME_MS = 12_000;

const WHISPER_FADE_MS = 600;

const INVITE_COOLDOWN_MS = 60_000;

@Component({
    selector: 'app-whisper-tab',
    imports: [FormsModule, TranslatePipe, LucideEye],
    templateUrl: './whisper-tab.component.html',
    styleUrl: './whisper-tab.component.scss',
})
export class WhisperTabComponent {
    @ViewChild('whisperFeed') private whisperFeedRef?: ElementRef<HTMLDivElement>;
    @ViewChild('composeInput') private composeInputRef?: ElementRef<HTMLTextAreaElement>;

    private readonly isMobile = Capacitor.isNativePlatform() || window.matchMedia('(pointer: coarse)').matches;

    protected readonly store = inject(AppStore);
    protected readonly prefs = inject(UserPreferencesService);
    protected readonly deviceId = inject(DeviceIdService);
    private readonly hub = inject(HubService);
    private readonly crypto = inject(CryptoService);
    private readonly haptics = inject(HapticsService);
    private readonly translate = inject(TranslateService);
    private readonly api = inject(ApiService);
    private readonly keyboardInset = inject(KeyboardInsetService);

    protected readonly messageText = signal('');
    protected readonly sending = signal(false);
    protected readonly whispers = signal<Whisper[]>([]);
    protected readonly presence = signal<WhisperPresenceEntry[]>([]);

    protected readonly members = signal<ListMember[]>([]);
    protected readonly showInvitePicker = signal(false);
    protected readonly selectedDeviceIds = signal<Set<string>>(new Set());
    protected readonly invitingAll = signal(false);
    protected readonly invitingSelected = signal(false);
    protected readonly inviteSent = signal(false);
    protected readonly cooldownRemaining = signal(0);
    private cooldownInterval: ReturnType<typeof setInterval> | null = null;
    private cooldownUntil: number | null = null;

    private readonly timers = new Set<ReturnType<typeof setTimeout>>();

    protected readonly othersPresence = () =>
        this.presence().filter(p => p.deviceId !== this.deviceId.deviceId);

    protected readonly inviteableMembers = () =>
        this.members().filter(m => !m.isCurrentDevice);

    protected readonly onCooldown = () => this.cooldownRemaining() > 0;

    constructor() {

        this.keyboardInset.willShow$.pipe(takeUntilDestroyed()).subscribe(() => {
            this.scrollToBottomDuringTransition();
        });

        let joinedListId: string | null = null;
        let presenceInitialized = false;

        const leave = (listId: string | null) => {
            if (!listId) return;
            void this.hub.leaveWhisperRoom(listId);
        };

        const join = async (listId: string) => {
            const name = this.prefs.senderName() || await firstValueFrom(this.translate.get('CHAT.ANONYMOUS'));
            await this.hub.joinWhisperRoom(listId, name);
        };

        effect(() => {
            const id = this.store.currentListId();
            const previous = untracked(() => joinedListId);
            if (previous === id) return;

            leave(previous);
            joinedListId = id;
            presenceInitialized = false;
            this.presence.set([]);
            this.whispers.set([]);
            this.members.set([]);
            this.showInvitePicker.set(false);
            this.selectedDeviceIds.set(new Set());

            if (id) {
                void join(id);
                const key = untracked(() => this.store.currentEncryptionKey());
                if (key) void this.loadMembers(id, key);
            }
        });

        this.hub.whisperPresenceChanged$.pipe(takeUntilDestroyed()).subscribe(({ listId, roster }) => {
            if (listId !== this.store.currentListId()) return;
            const myDeviceId = this.deviceId.deviceId;
            const prevCount = this.presence().filter(p => p.deviceId !== myDeviceId).length;
            const nextCount = roster.filter(p => p.deviceId !== myDeviceId).length;
            this.presence.set(roster);
            if (presenceInitialized) {
                if (nextCount > prevCount) this.haptics.letheViewerJoined();
                else if (nextCount < prevCount) this.haptics.letheViewerLeft();
            }
            presenceInitialized = true;
        });

        this.hub.whisperReceived$.pipe(takeUntilDestroyed()).subscribe(e => {
            if (e.listId !== this.store.currentListId()) return;
            void this.handleIncoming(e.ciphertext, e.iv, e.senderCiphertext, e.senderIv);
        });

        this.hub.reconnected$.pipe(takeUntilDestroyed()).subscribe(() => {
            const id = this.store.currentListId();
            if (id) void join(id);
        });

        const destroyRef = inject(DestroyRef);
        destroyRef.onDestroy(() => {
            leave(joinedListId);
            for (const t of this.timers) clearTimeout(t);
            this.timers.clear();
            if (this.cooldownInterval) clearInterval(this.cooldownInterval);
        });
    }

    private async loadMembers(listId: string, encryptionKey: string): Promise<void> {
        try {
            this.members.set(await this.store.fetchMembersForList(listId, encryptionKey));
        } catch { }
    }

    private async handleIncoming(ciphertext: string, iv: string, senderCiphertext: string, senderIv: string): Promise<void> {
        const key = this.store.currentEncryptionKey();
        if (!key) return;
        try {
            const [text, senderName] = await Promise.all([
                this.crypto.decrypt(ciphertext, iv, key),
                this.crypto.decrypt(senderCiphertext, senderIv, key),
            ]);
            this.pushWhisper(text, senderName, false);
        } catch { }
    }

    private scrollToBottomDuringTransition(): void {
        const el = this.whisperFeedRef?.nativeElement;
        if (!el) return;

        const durationMs = 250;
        const start = performance.now();

        const step = () => {
            el.scrollTop = el.scrollHeight;
            if (performance.now() - start < durationMs) {
                requestAnimationFrame(step);
            }
        };
        requestAnimationFrame(step);
    }

    private scrollToBottom(): void {
        requestAnimationFrame(() => {
            const el = this.whisperFeedRef?.nativeElement;
            if (el) el.scrollTop = el.scrollHeight;
        });
    }

    private pushWhisper(text: string, senderName: string, mine: boolean): void {
        const id = crypto.randomUUID();
        this.whispers.update(list => [...list, { id, text, senderName, mine, fading: false }]);
        this.scrollToBottom();

        const fadeTimer = setTimeout(() => {
            this.whispers.update(list => list.map(w => w.id === id ? { ...w, fading: true } : w));
            this.timers.delete(fadeTimer);
        }, WHISPER_LIFETIME_MS - WHISPER_FADE_MS);
        this.timers.add(fadeTimer);

        const removeTimer = setTimeout(() => {
            this.whispers.update(list => list.filter(w => w.id !== id));
            this.timers.delete(removeTimer);
        }, WHISPER_LIFETIME_MS);
        this.timers.add(removeTimer);
    }

    protected onKeydown(event: KeyboardEvent): void {
        if (this.isMobile) return;
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            void this.sendWhisper();
        }
    }

    protected autoResize(event: Event): void {
        const el = event.target as HTMLTextAreaElement;
        el.style.height = 'auto';
        el.style.height = el.scrollHeight + 'px';
    }

    async sendWhisper(): Promise<void> {
        const text = this.messageText().trim();
        const listId = this.store.currentListId();
        const key = this.store.currentEncryptionKey();
        if (!text || !listId || !key) return;

        this.haptics.whisperSent();
        this.sending.set(true);
        try {
            const senderName = this.prefs.senderName() || await firstValueFrom(this.translate.get('CHAT.ANONYMOUS'));
            const [body, sender] = await Promise.all([
                this.crypto.encrypt(text, key),
                this.crypto.encrypt(senderName, key),
            ]);
            await this.hub.sendWhisper(listId, body.ciphertext, body.iv, sender.ciphertext, sender.iv);
            this.pushWhisper(text, senderName, true);
            this.messageText.set('');
        } finally {
            this.sending.set(false);
            const el = this.composeInputRef?.nativeElement;
            if (el) el.style.height = 'auto';
        }
    }

    protected toggleInvitePicker(): void {
        this.showInvitePicker.update(v => !v);
    }

    protected toggleMemberSelection(deviceId: string): void {
        this.selectedDeviceIds.update(set => {
            const next = new Set(set);
            if (next.has(deviceId)) next.delete(deviceId);
            else next.add(deviceId);
            return next;
        });
    }

    async inviteAll(): Promise<void> {
        const listId = this.store.currentListId();
        if (!listId || this.onCooldown() || this.invitingAll()) return;

        this.invitingAll.set(true);
        try {
            await firstValueFrom(this.api.sendWhisperInvite(listId));
            this.onInviteSent();
        } catch (e) {
            this.onInviteError(e);
        } finally {
            this.invitingAll.set(false);
        }
    }

    async inviteSelected(): Promise<void> {
        const listId = this.store.currentListId();
        const targetDeviceIds = [...this.selectedDeviceIds()];
        if (!listId || targetDeviceIds.length === 0 || this.onCooldown() || this.invitingSelected()) return;

        this.invitingSelected.set(true);
        try {
            await firstValueFrom(this.api.sendWhisperInvite(listId, targetDeviceIds));
            this.selectedDeviceIds.set(new Set());
            this.onInviteSent();
        } catch (e) {
            this.onInviteError(e);
        } finally {
            this.invitingSelected.set(false);
        }
    }

    private onInviteSent(): void {
        this.showInvitePicker.set(false);
        this.startCooldown();

        this.inviteSent.set(true);
        const t = setTimeout(() => {
            this.inviteSent.set(false);
            this.timers.delete(t);
        }, 3000);
        this.timers.add(t);
    }

    private onInviteError(e: unknown): void {

        if (e instanceof HttpErrorResponse && e.status === 429) {
            this.startCooldown();
        }
    }

    private startCooldown(): void {
        this.cooldownUntil = Date.now() + INVITE_COOLDOWN_MS;
        this.tickCooldown();

        if (this.cooldownInterval) clearInterval(this.cooldownInterval);
        this.cooldownInterval = setInterval(() => this.tickCooldown(), 1000);
    }

    private tickCooldown(): void {
        if (this.cooldownUntil === null) {
            this.cooldownRemaining.set(0);
            return;
        }

        const remaining = Math.max(0, Math.ceil((this.cooldownUntil - Date.now()) / 1000));
        this.cooldownRemaining.set(remaining);

        if (remaining <= 0) {
            this.cooldownUntil = null;
            if (this.cooldownInterval) clearInterval(this.cooldownInterval);
            this.cooldownInterval = null;
        }
    }

    protected initials(name: string): string {
        const trimmed = name.trim();
        if (!trimmed) return '?';
        const parts = trimmed.split(/\s+/);
        if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
}
