import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { LucideAlarmClock } from '@lucide/angular';
import { ApiService } from '../../../api/api.service';
import { UpdateNemesisSettingsRequest } from '../../../core/models/nemesis.model';
import { IcalService } from '../../../core/services/ical.service';
import {
    DeleteAfterDuration,
    ListMember,
    ListReminderDto,
    TTL_LABELS,
    TTL_VALUE_TO_ENUM,
    WHISPER_LIFETIME_LABELS,
    WHISPER_LIFETIME_VALUE_TO_ENUM,
    WhisperLifetime,
} from '../../../core/models';
import { CryptoService } from '../../../core/services/crypto.service';
import { MasterPasswordService } from '../../../core/services/master-password.service';
import { UserPreferencesService } from '../../../core/services/user-preferences.service';
import { VaultKeyService } from '../../../core/services/vault-key.service';
import { formatReminderDate } from '../../../core/utils/reminder-date.util';
import { AvatarComponent } from '../../../shared/avatar/avatar.component';
import { QrScannerComponent } from '../../../shared/qr-scanner/qr-scanner.component';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';
import { AppStore } from '../../../store/app.store';
import { environment } from '../../../../environments/environment';
import { BiometricConfirmDialogComponent } from '../../settings/components/biometric-confirm-dialog/biometric-confirm-dialog.component';

interface MemberGroup {
    key: string;
    displayName: string;
    joinedAt: string;
    isCurrentUser: boolean;
    devices: ListMember[];
}

@Component({
    selector: 'app-settings-tab',
    imports: [DatePipe, FormsModule, QrScannerComponent, TranslatePipe, LucideAlarmClock, BiometricConfirmDialogComponent, AvatarComponent],
    templateUrl: './settings-tab.component.html',
    styleUrl: './settings-tab.component.scss',
})
export class SettingsTabComponent {
    protected readonly store = inject(AppStore);
    protected readonly prefs = inject(UserPreferencesService);
    protected readonly masterPassword = inject(MasterPasswordService);
    private readonly vaultKey = inject(VaultKeyService);
    private readonly router = inject(Router);
    private readonly crypto = inject(CryptoService);
    private readonly translate = inject(TranslateService);
    private readonly ical = inject(IcalService);
    private readonly api = inject(ApiService);

    protected readonly showSensitiveUnlockPrompt = signal(false);
    protected readonly sensitiveUnlockWorking = signal(false);
    protected readonly sensitiveUnlockError = signal(false);

    protected readonly ttlOptions = Object.values(DeleteAfterDuration).map(v => ({
        value: v,
        label: TTL_LABELS[v],
    }));

    protected readonly selectedTtl = signal<DeleteAfterDuration>(DeleteAfterDuration.OneWeek);
    protected readonly savingTtl = signal(false);
    protected readonly ttlSaved = signal(false);

    protected readonly whisperLifetimeOptions = Object.values(WhisperLifetime).map(v => ({
        value: v,
        label: WHISPER_LIFETIME_LABELS[v],
    }));

    protected readonly selectedWhisperLifetime = signal<WhisperLifetime>(WhisperLifetime.FiveSeconds);
    protected readonly savingWhisperLifetime = signal(false);
    protected readonly whisperLifetimeSaved = signal(false);
    protected readonly deletingList = signal(false);
    protected readonly linkCopied = signal(false);

    protected readonly listReminderDateTime = signal('');
    protected readonly listReminderMinDateTime = computed(() => {
        const d = new Date(Date.now() + 60_000);
        const pad = (n: number) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    });
    protected readonly listReminders = signal<ListReminderDto[]>([]);
    protected readonly settingListReminder = signal(false);
    protected readonly cancelingListReminderId = signal<string | null>(null);

    protected readonly listName = signal('');
    protected readonly renamingList = signal(false);
    protected readonly nameSaved = signal(false);

    protected readonly shareStep = signal<'idle' | 'scan' | 'done' | 'error'>('idle');
    protected readonly scannedJson = signal('');

    protected readonly members = signal<ListMember[]>([]);
    protected readonly memberGroups = computed<MemberGroup[]>(() => {
        const groups = new Map<string, MemberGroup>();

        for (const member of this.members()) {
            const key = member.userId ? `user:${member.userId}` : `device:${member.deviceId}`;
            const existing = groups.get(key);
            if (existing) {
                existing.devices.push(member);
                if (member.isCurrentUser) existing.isCurrentUser = true;
                if (member.joinedAt < existing.joinedAt) existing.joinedAt = member.joinedAt;
            } else {
                groups.set(key, {
                    key,
                    displayName: member.displayName,
                    joinedAt: member.joinedAt,
                    isCurrentUser: member.isCurrentUser,
                    devices: [member],
                });
            }
        }

        return [...groups.values()].sort((a, b) => {
            if (a.isCurrentUser) return -1;
            if (b.isCurrentUser) return 1;
            return a.displayName.localeCompare(b.displayName);
        });
    });
    protected readonly membersLoading = signal(false);
    protected readonly kickingDeviceId = signal<string | null>(null);

    protected readonly nemesisExpiryDays = signal(60);
    protected readonly nemesisHideAfterDays = signal(30);
    protected readonly savingNemesisSettings = signal(false);
    protected readonly nemesisSettingsSaved = signal(false);

    protected readonly notifyOnMessage = signal(true);
    protected readonly notifyOnItemsChanged = signal(false);
    protected readonly notifyOnLethe = signal(true);
    protected readonly notifyOnCharon = signal(true);
    protected readonly notifyOnNemesis = signal(true);
    protected readonly isSensitive = signal(false);

    constructor() {
        effect(() => {
            const id = this.store.currentListId();
            untracked(() => this.initForList(id));
        });
    }

    private initForList(id: string | null): void {
        this.shareStep.set('idle');
        this.scannedJson.set('');
        this.nameSaved.set(false);
        this.ttlSaved.set(false);
        this.whisperLifetimeSaved.set(false);
        this.linkCopied.set(false);
        this.members.set([]);
        this.listReminders.set([]);
        this.listReminderDateTime.set('');

        if (!id) return;

        const list = this.store.currentList();
        if (list?.ttl != null) {
            const mapped = TTL_VALUE_TO_ENUM[list.ttl];
            if (mapped) this.selectedTtl.set(mapped);
        }
        if (list?.whisperLifetimeSeconds != null) {
            const mapped = WHISPER_LIFETIME_VALUE_TO_ENUM[list.whisperLifetimeSeconds];
            if (mapped) this.selectedWhisperLifetime.set(mapped);
        }

        const known = this.store.knownLists().find(l => l.id === id);
        if (known) {
            this.listName.set(known.name);
            this.notifyOnMessage.set(known.notifyOnMessage ?? true);
            this.notifyOnItemsChanged.set(known.notifyOnItemsChanged ?? false);
            this.notifyOnLethe.set(known.notifyOnLethe ?? true);
            this.notifyOnCharon.set(known.notifyOnCharon ?? true);
            this.notifyOnNemesis.set(known.notifyOnNemesis ?? true);
            this.isSensitive.set(known.isSensitive ?? false);
            void this.loadMembers(known.id, known.encryptionKey);
            void this.loadListReminders(known.id);
            void this.loadNemesisSettings(known.id);
        }
    }

    private loadListReminders(listId: string): void {
        this.api.getListReminders(listId).subscribe({
            next: reminders => this.listReminders.set(reminders),
            error: () => { },
        });
    }

    private async loadNemesisSettings(listId: string): Promise<void> {
        try {
            const data = await firstValueFrom(this.api.getNemesisData(listId));
            this.nemesisExpiryDays.set(data.nemesisSettlementExpiryDays ?? 60);
            this.nemesisHideAfterDays.set(data.nemesisSettlementHideAfterDays ?? 30);
        } catch { }
    }

    protected formatReminderDate(isoStr: string): string {
        return formatReminderDate(isoStr);
    }

    private async loadMembers(listId: string, encryptionKey: string): Promise<void> {
        this.membersLoading.set(true);
        try {
            const members = await this.store.fetchMembersForList(listId, encryptionKey);
            members.sort((a, b) => {
                if (a.isCurrentUser) return -1;
                if (b.isCurrentUser) return 1;
                if (a.userId && b.userId && a.userId === b.userId) {
                    return a.joinedAt.localeCompare(b.joinedAt);
                }
                return a.displayName.localeCompare(b.displayName);
            });
            this.members.set(members);
        } catch { } finally {
            this.membersLoading.set(false);
        }
    }

    async saveTtl(): Promise<void> {
        this.savingTtl.set(true);
        try {
            await this.store.updateTtl(this.selectedTtl());
            this.ttlSaved.set(true);
            setTimeout(() => this.ttlSaved.set(false), 2000);
        } finally {
            this.savingTtl.set(false);
        }
    }

    async saveWhisperLifetime(): Promise<void> {
        this.savingWhisperLifetime.set(true);
        try {
            await this.store.updateWhisperLifetime(this.selectedWhisperLifetime());
            this.whisperLifetimeSaved.set(true);
            setTimeout(() => this.whisperLifetimeSaved.set(false), 2000);
        } finally {
            this.savingWhisperLifetime.set(false);
        }
    }

    async saveListName(): Promise<void> {
        const name = this.listName().trim();
        const id = this.store.currentListId();
        if (!name || !id) return;
        this.renamingList.set(true);
        try {
            await this.store.renameList(id, name);
            this.nameSaved.set(true);
            setTimeout(() => this.nameSaved.set(false), 2000);
        } finally {
            this.renamingList.set(false);
        }
    }

    async copyShareLink(): Promise<void> {
        const id = this.store.currentListId();
        const known = this.store.knownLists().find(l => l.id === id);
        if (!id || !known || !known.encryptionKey) return;
        const origin = Capacitor.isNativePlatform()
            ? environment.nativeShareBaseUrl
            : window.location.origin;
        const url = `${origin}/join/${id}?n=${encodeURIComponent(known.name)}#${this.crypto.toUrlSafeB64(known.encryptionKey)}`;
        await navigator.clipboard.writeText(url);
        this.linkCopied.set(true);
        setTimeout(() => this.linkCopied.set(false), 2000);
    }

    startShare(): void {
        this.shareStep.set('scan');
        this.scannedJson.set('');
    }

    cancelShare(): void {
        this.shareStep.set('idle');
        this.scannedJson.set('');
    }

    async onQrDetected(raw: string): Promise<void> {
        this.scannedJson.set(raw);
        await this.confirmShare();
    }

    async confirmShare(): Promise<void> {
        try {
            const payload = JSON.parse(this.scannedJson()) as { publicKey: string; sessionId: string };
            await this.store.shareToReceiver(payload.sessionId, payload.publicKey);
            this.shareStep.set('done');
        } catch {
            this.shareStep.set('error');
        }
    }

    downloadListReminder(): void {
        const id = this.store.currentListId();
        const dt = this.listReminderDateTime();
        if (!id || !dt) return;
        this.ical.downloadForList(id, new Date(dt).toISOString());
    }

    async setListReminder(): Promise<void> {
        const id = this.store.currentListId();
        const dt = this.listReminderDateTime();
        if (!id || !dt) return;
        this.settingListReminder.set(true);
        try {
            const remindAt = new Date(dt).toISOString();
            const reminderId = await firstValueFrom(this.api.createListReminder({ ghostListId: id, remindAt }));
            this.listReminders.update(list => [...list, { id: reminderId, remindAt }].sort((a, b) => a.remindAt.localeCompare(b.remindAt)));
            this.listReminderDateTime.set('');
        } catch {
        } finally {
            this.settingListReminder.set(false);
        }
    }

    async cancelListReminder(reminderId: string): Promise<void> {
        this.cancelingListReminderId.set(reminderId);
        try {
            await firstValueFrom(this.api.deleteListReminder(reminderId));
            this.listReminders.update(list => list.filter(r => r.id !== reminderId));
        } catch {
        } finally {
            this.cancelingListReminderId.set(null);
        }
    }

    async saveNemesisSettings(): Promise<void> {
        const id = this.store.currentListId();
        if (!id) return;
        const request: UpdateNemesisSettingsRequest = {
            expiryDays: Math.max(1, Math.min(3650, this.nemesisExpiryDays())),
            hideAfterDays: Math.max(0, Math.min(365, this.nemesisHideAfterDays())),
        };
        this.savingNemesisSettings.set(true);
        try {
            await firstValueFrom(this.api.updateNemesisSettings(id, request));
            this.nemesisSettingsSaved.set(true);
            setTimeout(() => this.nemesisSettingsSaved.set(false), 2000);
        } finally {
            this.savingNemesisSettings.set(false);
        }
    }

    async deleteList(): Promise<void> {
        const msg = await firstValueFrom(this.translate.get('LIST_SETTINGS.CONFIRM_DELETE'));
        if (!confirm(msg)) return;
        this.deletingList.set(true);
        try {
            const id = this.store.currentListId()!;
            await this.store.deleteList(id);
            await this.router.navigate(['/']);
        } finally {
            this.deletingList.set(false);
        }
    }

    async forgetList(): Promise<void> {
        const msg = await firstValueFrom(this.translate.get('LIST_SETTINGS.CONFIRM_FORGET'));
        if (!confirm(msg)) return;
        const id = this.store.currentListId()!;
        await this.store.forgetList(id);
        await this.router.navigate(['/']);
    }

    async setNotifyOnMessage(value: boolean): Promise<void> {
        const id = this.store.currentListId();
        if (!id) return;
        this.notifyOnMessage.set(value);
        await this.store.updateNotificationPreferences(id, value, this.notifyOnItemsChanged(), this.notifyOnLethe(), this.notifyOnCharon(), this.notifyOnNemesis());
    }

    async setNotifyOnItemsChanged(value: boolean): Promise<void> {
        const id = this.store.currentListId();
        if (!id) return;
        this.notifyOnItemsChanged.set(value);
        await this.store.updateNotificationPreferences(id, this.notifyOnMessage(), value, this.notifyOnLethe(), this.notifyOnCharon(), this.notifyOnNemesis());
    }

    async setNotifyOnLethe(value: boolean): Promise<void> {
        const id = this.store.currentListId();
        if (!id) return;
        this.notifyOnLethe.set(value);
        await this.store.updateNotificationPreferences(id, this.notifyOnMessage(), this.notifyOnItemsChanged(), value, this.notifyOnCharon(), this.notifyOnNemesis());
    }

    async setNotifyOnCharon(value: boolean): Promise<void> {
        const id = this.store.currentListId();
        if (!id) return;
        this.notifyOnCharon.set(value);
        await this.store.updateNotificationPreferences(id, this.notifyOnMessage(), this.notifyOnItemsChanged(), this.notifyOnLethe(), value, this.notifyOnNemesis());
    }

    async setNotifyOnNemesis(value: boolean): Promise<void> {
        const id = this.store.currentListId();
        if (!id) return;
        this.notifyOnNemesis.set(value);
        await this.store.updateNotificationPreferences(id, this.notifyOnMessage(), this.notifyOnItemsChanged(), this.notifyOnLethe(), this.notifyOnCharon(), value);
    }

    async setSensitive(value: boolean): Promise<void> {
        const id = this.store.currentListId();
        if (!id) return;

        if (value && !this.masterPassword.hasPassword()) {
            await this.router.navigate(['/settings']);
            return;
        }

        if (value && !this.vaultKey.isUnlocked()) {
            this.sensitiveUnlockError.set(false);
            this.showSensitiveUnlockPrompt.set(true);
            return;
        }

        this.isSensitive.set(value);
        await this.store.setListSensitive(id, value);
    }

    async confirmSensitiveUnlock(password: string): Promise<void> {
        const id = this.store.currentListId();
        if (!id) return;
        this.sensitiveUnlockWorking.set(true);
        this.sensitiveUnlockError.set(false);
        try {
            const ok = await this.masterPassword.verifyPassword(password);
            if (!ok) { this.sensitiveUnlockError.set(true); return; }
            this.showSensitiveUnlockPrompt.set(false);
            this.isSensitive.set(true);
            await this.store.setListSensitive(id, true);
            await this.store.unlockKnownLists();
        } finally {
            this.sensitiveUnlockWorking.set(false);
        }
    }

    cancelSensitiveUnlock(): void {
        this.showSensitiveUnlockPrompt.set(false);
        this.sensitiveUnlockError.set(false);
    }

    async kickMember(targetDeviceId: string): Promise<void> {
        const msg = await firstValueFrom(this.translate.get('LIST_SETTINGS.KICK_CONFIRM'));
        if (!confirm(msg)) return;
        const id = this.store.currentListId();
        if (!id) return;
        this.kickingDeviceId.set(targetDeviceId);
        try {
            await this.store.kickMember(id, targetDeviceId);
            this.members.update(list => list.filter(m => m.deviceId !== targetDeviceId));
        } catch { } finally {
            this.kickingDeviceId.set(null);
        }
    }

    async removeOwnMachine(targetDeviceId: string): Promise<void> {
        const msg = await firstValueFrom(this.translate.get('LIST_SETTINGS.MACHINE_REMOVE_CONFIRM'));
        if (!confirm(msg)) return;
        const id = this.store.currentListId();
        if (!id) return;
        this.kickingDeviceId.set(targetDeviceId);
        try {
            await this.store.removeOwnMemberMachine(id, targetDeviceId);
            this.members.update(list => list.filter(m => m.deviceId !== targetDeviceId));
        } catch { } finally {
            this.kickingDeviceId.set(null);
        }
    }
}
