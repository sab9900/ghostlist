import { DatePipe } from '@angular/common';
import { Component, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { DeleteAfterDuration, ListMember, TTL_LABELS, TTL_VALUE_TO_ENUM } from '../../../core/models';
import { CryptoService } from '../../../core/services/crypto.service';
import { MasterPasswordService } from '../../../core/services/master-password.service';
import { UserPreferencesService } from '../../../core/services/user-preferences.service';
import { QrScannerComponent } from '../../../shared/qr-scanner/qr-scanner.component';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';
import { AppStore } from '../../../store/app.store';
import { environment } from '../../../../environments/environment';

@Component({
    selector: 'app-settings-tab',
    imports: [DatePipe, FormsModule, QrScannerComponent, TranslatePipe],
    templateUrl: './settings-tab.component.html',
    styleUrl: './settings-tab.component.scss',
})
export class SettingsTabComponent {
    protected readonly store = inject(AppStore);
    protected readonly prefs = inject(UserPreferencesService);
    protected readonly masterPassword = inject(MasterPasswordService);
    private readonly router = inject(Router);
    private readonly crypto = inject(CryptoService);
    private readonly translate = inject(TranslateService);

    protected readonly ttlOptions = Object.values(DeleteAfterDuration).map(v => ({
        value: v,
        label: TTL_LABELS[v],
    }));

    protected readonly selectedTtl = signal<DeleteAfterDuration>(DeleteAfterDuration.OneWeek);
    protected readonly savingTtl = signal(false);
    protected readonly ttlSaved = signal(false);
    protected readonly deletingList = signal(false);
    protected readonly linkCopied = signal(false);

    protected readonly listName = signal('');
    protected readonly renamingList = signal(false);
    protected readonly nameSaved = signal(false);

    protected readonly shareStep = signal<'idle' | 'scan' | 'done' | 'error'>('idle');
    protected readonly scannedJson = signal('');

    protected readonly members = signal<ListMember[]>([]);
    protected readonly membersLoading = signal(false);
    protected readonly kickingDeviceId = signal<string | null>(null);

    protected readonly notifyOnMessage = signal(true);
    protected readonly notifyOnItemsChanged = signal(false);
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
        this.linkCopied.set(false);
        this.members.set([]);

        if (!id) return;

        const list = this.store.currentList();
        if (list?.ttl != null) {
            const mapped = TTL_VALUE_TO_ENUM[list.ttl];
            if (mapped) this.selectedTtl.set(mapped);
        }

        const known = this.store.knownLists().find(l => l.id === id);
        if (known) {
            this.listName.set(known.name);
            this.notifyOnMessage.set(known.notifyOnMessage ?? true);
            this.notifyOnItemsChanged.set(known.notifyOnItemsChanged ?? false);
            this.isSensitive.set(known.isSensitive ?? false);
            void this.loadMembers(known.id, known.encryptionKey);
        }
    }

    private async loadMembers(listId: string, encryptionKey: string): Promise<void> {
        this.membersLoading.set(true);
        try {
            const members = await this.store.fetchMembersForList(listId, encryptionKey);
            members.sort((a, b) => {
                if (a.isCurrentUser) return -1;
                if (b.isCurrentUser) return 1;
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
        if (!id || !known) return;
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
        await this.store.updateNotificationPreferences(id, value, this.notifyOnItemsChanged());
    }

    async setNotifyOnItemsChanged(value: boolean): Promise<void> {
        const id = this.store.currentListId();
        if (!id) return;
        this.notifyOnItemsChanged.set(value);
        await this.store.updateNotificationPreferences(id, this.notifyOnMessage(), value);
    }

    async setSensitive(value: boolean): Promise<void> {
        const id = this.store.currentListId();
        if (!id) return;

        // No master password set yet — send the user to set one up before
        // a list can be marked sensitive (sensitive lists would otherwise
        // be unrecoverable: there's no master password to reveal them with).
        if (value && !this.masterPassword.hasPassword()) {
            await this.router.navigate(['/settings']);
            return;
        }

        this.isSensitive.set(value);
        await this.store.setListSensitive(id, value);
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
}
