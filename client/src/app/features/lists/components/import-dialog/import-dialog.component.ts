import { Component, OnDestroy, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { ExportQrPayload, ListFullError, ReceiveQrPayload } from '../../../../core/models';
import { QrCodeComponent } from '../../../../shared/qr-code/qr-code.component';
import { QrScannerComponent } from '../../../../shared/qr-scanner/qr-scanner.component';
import { AppStore } from '../../../../store/app.store';
import { OverlayComponent } from '../../../../shared/overlay/overlay.component';

@Component({
    selector: 'app-import-dialog',
    imports: [OverlayComponent, FormsModule, TranslatePipe, QrCodeComponent, QrScannerComponent],
    templateUrl: './import-dialog.component.html',
    styleUrl: './import-dialog.component.scss',
})
export class ImportDialogComponent implements OnDestroy {
    private readonly store = inject(AppStore);
    private readonly router = inject(Router);

    readonly show = input(false);
    readonly closed = output<void>();

    protected readonly importMode = signal<'show' | 'scan' | 'url'>('show');
    protected readonly importQrData = signal<string | null>(null);
    protected readonly scanStep = signal<'scanning' | 'waiting' | 'error'>('scanning');
    protected readonly importErrorMsg = signal<string | null>(null);
    protected readonly importUrl = signal('');
    protected readonly importUrlError = signal<string | null>(null);
    protected readonly importPending = signal(false);

    private importPollTimer: ReturnType<typeof setInterval> | null = null;
    private importSessionId: string | null = null;
    private exportSessionId: string | null = null;
    private exportListId: string | null = null;
    private exportListName: string | null = null;
    private exportClaimTimer: ReturnType<typeof setInterval> | null = null;

    constructor() {
        effect(() => {
            if (this.show()) {
                void this.openImportDialog();
            }
        });
    }

    ngOnDestroy(): void {
        this.stopImportPolling();
        this.stopExportClaimPolling();
    }

    private async openImportDialog(): Promise<void> {
        this.importMode.set('show');
        this.importQrData.set(null);
        this.scanStep.set('scanning');
        this.importErrorMsg.set(null);
        this.importUrl.set('');
        this.importUrlError.set(null);
        await this.startShowMode();
    }

    async setImportMode(mode: 'show' | 'scan' | 'url'): Promise<void> {
        this.stopImportPolling();
        this.stopExportClaimPolling();
        this.importMode.set(mode);
        this.scanStep.set('scanning');
        this.importErrorMsg.set(null);
        this.importUrl.set('');
        this.importUrlError.set(null);
        if (mode === 'show') await this.startShowMode();
    }

    private async startShowMode(): Promise<void> {
        this.importPending.set(true);
        try {
            const payload: ReceiveQrPayload = await this.store.initReceive();
            this.importSessionId = payload.sessionId;
            this.importQrData.set(JSON.stringify(payload));
            this.startImportPolling(payload.sessionId);
        } catch {
            this.importPending.set(false);
        }
    }

    private startImportPolling(sessionId: string): void {
        this.stopImportPolling();
        this.importPollTimer = setInterval(async () => {
            try {
                const id = await this.store.claimSharedKey(sessionId);
                this.stopImportPolling();
                this.closed.emit();
                await this.router.navigate(['/list', id]);
            } catch (e: unknown) {
                if (e instanceof ListFullError) {
                    this.stopImportPolling();
                    this.importErrorMsg.set('LISTS.ERROR_LIST_FULL');
                }
            }
        }, 2000);
    }

    private stopImportPolling(): void {
        if (this.importPollTimer !== null) {
            clearInterval(this.importPollTimer);
            this.importPollTimer = null;
        }
    }

    async onExportQrDetected(raw: string): Promise<void> {
        try {
            const payload = JSON.parse(raw) as ExportQrPayload;
            if (payload.type !== 'export') throw new Error('Not an export QR.');
            this.exportSessionId = payload.sessionId;
            this.exportListId = payload.listId;
            this.exportListName = payload.listName;
            await this.store.respondToExport(payload.sessionId);
            this.scanStep.set('waiting');
            this.startExportClaimPolling(payload.sessionId, payload.listId, payload.listName);
        } catch {
            this.scanStep.set('error');
        }
    }

    private startExportClaimPolling(sessionId: string, listId: string, listName: string): void {
        this.stopExportClaimPolling();
        this.exportClaimTimer = setInterval(async () => {
            try {
                const id = await this.store.claimExportedKey(sessionId, listId, listName);
                this.stopExportClaimPolling();
                this.closed.emit();
                await this.router.navigate(['/list', id]);
            } catch (e: unknown) {
                if (e instanceof ListFullError) {
                    this.stopExportClaimPolling();
                    this.importErrorMsg.set('LISTS.ERROR_LIST_FULL');
                    this.scanStep.set('error');
                }
            }
        }, 2000);
    }

    private stopExportClaimPolling(): void {
        if (this.exportClaimTimer !== null) {
            clearInterval(this.exportClaimTimer);
            this.exportClaimTimer = null;
        }
    }

    retryScan(): void {
        this.scanStep.set('scanning');
        this.importErrorMsg.set(null);
        this.exportSessionId = null;
    }

    async submitImportUrl(): Promise<void> {
        const raw = this.importUrl().trim();
        if (!raw) return;
        this.importUrlError.set(null);
        try {
            const parsed = new URL(raw);
            const segments = parsed.pathname.split('/').filter(Boolean);
            const joinIndex = segments.indexOf('join');
            const id = joinIndex !== -1 ? segments[joinIndex + 1] : undefined;
            if (!id || !parsed.hash) {
                this.importUrlError.set('LISTS.IMPORT_URL_INVALID');
                return;
            }
            const slug = parsed.pathname + parsed.search + parsed.hash;
            this.closeDialog();
            await this.router.navigateByUrl(slug);
        } catch {
            this.importUrlError.set('LISTS.IMPORT_URL_INVALID');
        }
    }

    closeDialog(): void {
        this.stopImportPolling();
        this.stopExportClaimPolling();
        this.importQrData.set(null);
        this.importErrorMsg.set(null);
        this.importUrl.set('');
        this.importUrlError.set(null);
        this.importSessionId = null;
        this.exportSessionId = null;
        this.exportListId = null;
        this.exportListName = null;
        this.closed.emit();
    }
}
