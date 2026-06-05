import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { DeleteAfterDuration, TTL_LABELS, TTL_VALUE_TO_ENUM } from '../../../core/models';
import { UserPreferencesService } from '../../../core/services/user-preferences.service';
import { QrScannerComponent } from '../../../shared/qr-scanner/qr-scanner.component';
import { AppStore } from '../../../store/app.store';

@Component({
    selector: 'app-settings-tab',
    imports: [FormsModule, QrScannerComponent],
    templateUrl: './settings-tab.component.html',
    styleUrl: './settings-tab.component.scss',
})
export class SettingsTabComponent implements OnInit {
    protected readonly store = inject(AppStore);
    protected readonly prefs = inject(UserPreferencesService);
    private readonly router = inject(Router);

    protected readonly ttlOptions = Object.values(DeleteAfterDuration).map(v => ({
        value: v,
        label: TTL_LABELS[v],
    }));

    protected readonly selectedTtl = signal<DeleteAfterDuration>(DeleteAfterDuration.OneWeek);
    protected readonly savingTtl = signal(false);
    protected readonly deletingList = signal(false);
    protected readonly linkCopied = signal(false);

    protected readonly shareStep = signal<'idle' | 'scan' | 'done' | 'error'>('idle');
    protected readonly scannedJson = signal('');

    ngOnInit(): void {
        const list = this.store.currentList();
        if (list?.ttl != null) {
            const mapped = TTL_VALUE_TO_ENUM[list.ttl];
            if (mapped) this.selectedTtl.set(mapped);
        }
    }

    async saveTtl(): Promise<void> {
        this.savingTtl.set(true);
        try {
            await this.store.updateTtl(this.selectedTtl());
        } finally {
            this.savingTtl.set(false);
        }
    }

    async copyShareLink(): Promise<void> {
        const id = this.store.currentListId();
        const known = this.store.knownLists().find(l => l.id === id);
        if (!id || !known) return;
        const url = `${window.location.origin}/join/${id}#${known.encryptionKey}`;
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
        if (!confirm('Delete this list for everyone? This cannot be undone.')) return;
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
        if (!confirm('Remove this list from this device?')) return;
        const id = this.store.currentListId()!;
        await this.store.forgetList(id);
        await this.router.navigate(['/']);
    }
}
