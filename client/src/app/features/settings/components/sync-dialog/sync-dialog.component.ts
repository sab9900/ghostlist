import { Component, OnDestroy, effect, inject, input, output, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { LucideCopy } from '@lucide/angular';
import { TranslatePipe } from '@ngx-translate/core';
import { environment } from '../../../../../environments/environment';
import { SyncQrPayload } from '../../../../core/models';
import { CryptoService } from '../../../../core/services/crypto.service';
import { WebAuthnService } from '../../../../core/services/webauthn.service';
import { QrCodeComponent } from '../../../../shared/qr-code/qr-code.component';
import { QrScannerComponent } from '../../../../shared/qr-scanner/qr-scanner.component';
import { AppStore } from '../../../../store/app.store';
import { OverlayComponent } from '../../../../shared/overlay/overlay.component';

@Component({
    selector: 'app-sync-dialog',
    imports: [OverlayComponent, TranslatePipe, QrCodeComponent, QrScannerComponent, LucideCopy],
    templateUrl: './sync-dialog.component.html',
    styleUrl: './sync-dialog.component.scss',
})
export class SyncDialogComponent implements OnDestroy {
    private readonly store = inject(AppStore);
    private readonly crypto = inject(CryptoService);
    private readonly webAuthn = inject(WebAuthnService);

    readonly show = input(false);
    readonly closed = output<void>();
    readonly done = output<number>();

    protected readonly syncStep = signal<'qr' | 'scan' | 'waiting' | 'done' | 'error'>('qr');
    protected readonly syncQrData = signal<string | null>(null);
    protected readonly syncLinkCopied = signal(false);
    protected readonly syncImportedCount = signal(0);

    private syncPollTimer: ReturnType<typeof setInterval> | null = null;
    private syncSessionId: string | null = null;
    private syncPayload: SyncQrPayload | null = null;

    constructor() {
        effect(() => {
            if (this.show()) {
                void this.initSyncReceive();
            }
        });
    }

    ngOnDestroy(): void {
        this.stopSyncPoll();
    }

    private async initSyncReceive(): Promise<void> {
        this.resetSync();
        try {
            const payload: SyncQrPayload = await this.store.initSyncReceive();
            this.syncSessionId = payload.sessionId;
            this.syncPayload = payload;
            this.syncQrData.set(JSON.stringify(payload));
            this.syncStep.set('qr');
            this.startReceivePoll(payload.sessionId);
        } catch {
            this.syncStep.set('error');
        }
    }

    showScanner(): void {
        this.stopSyncPoll();
        this.syncStep.set('scan');
    }

    async copySyncLink(): Promise<void> {
        if (!this.syncPayload) return;
        const origin = Capacitor.isNativePlatform()
            ? environment.nativeShareBaseUrl
            : window.location.origin;
        const url = `${origin}/sync/${this.syncPayload.sessionId}#${this.crypto.toUrlSafeB64(this.syncPayload.publicKey)}`;
        try { await navigator.clipboard.writeText(url); } catch { }
        this.syncLinkCopied.set(true);
        setTimeout(() => this.syncLinkCopied.set(false), 2000);
    }

    private startReceivePoll(sessionId: string): void {
        this.syncPollTimer = setInterval(async () => {
            try {
                const count = await this.store.claimSyncBundle(sessionId);
                if (count === null) return;
                this.stopSyncPoll();
                this.syncImportedCount.set(count);
                this.syncStep.set('done');
                this.done.emit(count);
            } catch { }
        }, 2000);
    }

    async onSyncQrDetected(raw: string): Promise<void> {
        try {
            const payload = JSON.parse(raw) as SyncQrPayload;
            if (payload.type !== 'sync') throw new Error('Not a sync QR.');
            await this.store.initSyncSendToReceiver(payload.sessionId, payload.publicKey);
            this.syncSessionId = payload.sessionId;
            this.syncStep.set('waiting');
            this.startSendReplyPoll(payload.sessionId);
        } catch {
            this.syncStep.set('error');
        }
    }

    private startSendReplyPoll(sessionId: string): void {
        this.syncPollTimer = setInterval(async () => {
            try {
                const count = await this.store.claimSyncReply(sessionId);
                if (count === null) return;
                this.stopSyncPoll();
                this.syncImportedCount.set(count);
                this.syncStep.set('done');
                this.done.emit(count);
            } catch { }
        }, 2000);
    }

    private stopSyncPoll(): void {
        if (this.syncPollTimer !== null) {
            clearInterval(this.syncPollTimer);
            this.syncPollTimer = null;
        }
    }

    private resetSync(): void {
        this.stopSyncPoll();
        this.syncQrData.set(null);
        this.syncLinkCopied.set(false);
        this.syncSessionId = null;
        this.syncPayload = null;
        this.syncImportedCount.set(0);
    }

    closeDialog(): void {
        this.resetSync();
        this.closed.emit();
    }
}
