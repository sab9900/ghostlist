import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../../api/api.service';
import { HubService } from '../../../api/hub.service';
import { ListMember, WhisperPresenceEntry } from '../../../core/models';
import { CryptoService } from '../../../core/services/crypto.service';
import { DeviceIdService } from '../../../core/services/device-id.service';
import { UserPreferencesService } from '../../../core/services/user-preferences.service';
import { AppStore } from '../../../store/app.store';

interface Whisper {
    id: string;
    text: string;
    senderName: string;
    mine: boolean;
    fading: boolean;
}

/** How long a whisper stays on screen before it disappears for good (ms). */
const WHISPER_LIFETIME_MS = 12_000;

/** How long the fade-out animation runs before the whisper is removed entirely (ms). */
const WHISPER_FADE_MS = 600;

/** Cooldown between Whisper invites for the same list (must match the server's). */
const INVITE_COOLDOWN_MS = 60_000;

@Component({
    selector: 'app-whisper-tab',
    imports: [FormsModule, TranslatePipe],
    templateUrl: './whisper-tab.component.html',
    styleUrl: './whisper-tab.component.scss',
})
export class WhisperTabComponent {
    protected readonly store = inject(AppStore);
    protected readonly prefs = inject(UserPreferencesService);
    protected readonly deviceId = inject(DeviceIdService);
    private readonly hub = inject(HubService);
    private readonly crypto = inject(CryptoService);
    private readonly translate = inject(TranslateService);
    private readonly api = inject(ApiService);

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
        let joinedListId: string | null = null;

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
            this.presence.set(roster);
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

    private pushWhisper(text: string, senderName: string, mine: boolean): void {
        const id = crypto.randomUUID();
        this.whispers.update(list => [...list, { id, text, senderName, mine, fading: false }]);

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

    async sendWhisper(): Promise<void> {
        const text = this.messageText().trim();
        const listId = this.store.currentListId();
        const key = this.store.currentEncryptionKey();
        if (!text || !listId || !key) return;

        (document.activeElement as HTMLElement)?.blur();
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
        // 429 = another device just sent an invite for this list; sync our cooldown to match.
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
