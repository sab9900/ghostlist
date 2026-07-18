import { Component, OnDestroy, effect, inject, input, output, signal, untracked } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { KnownList } from '../../../../core/models';
import { QrCodeComponent } from '../../../../shared/qr-code/qr-code.component';
import { AppStore } from '../../../../store/app.store';
import { OverlayComponent } from '../../../../shared/overlay/overlay.component';

@Component({
    selector: 'app-export-dialog',
    imports: [OverlayComponent, TranslatePipe, QrCodeComponent],
    templateUrl: './export-dialog.component.html',
    styleUrl: './export-dialog.component.scss',
})
export class ExportDialogComponent implements OnDestroy {
    private readonly store = inject(AppStore);

    readonly show = input(false);
    readonly lists = input<KnownList[]>([]);
    readonly activeListId = input<string | null>(null);

    readonly closed = output<void>();

    protected readonly exportStep = signal<'pick' | 'qr' | 'done' | 'error'>('pick');
    protected readonly exportQrData = signal<string | null>(null);
    protected readonly exportSelectedListId = signal<string | null>(null);

    private exportHandshakePollTimer: ReturnType<typeof setInterval> | null = null;
    private activeExportSessionId: string | null = null;

    constructor() {
        effect(() => {
            if (this.show()) {
                untracked(() => {
                    const activeListId = this.activeListId();
                    this.exportSelectedListId.set(activeListId);
                    this.exportQrData.set(null);
                    this.exportStep.set(activeListId ? 'qr' : 'pick');
                    if (activeListId) this.startExport(activeListId);
                });
            }
        });
    }

    ngOnDestroy(): void {
        this.stopExportHandshakePolling();
    }

    selectExportList(listId: string): void {
        this.exportSelectedListId.set(listId);
        this.exportStep.set('qr');
        this.startExport(listId);
    }

    private startExport(listId: string): void {
        try {
            const payload = this.store.initExportForList(listId);
            this.activeExportSessionId = payload.sessionId;
            this.exportQrData.set(JSON.stringify(payload));
            this.startExportHandshakePolling(payload.sessionId, listId);
        } catch {
            this.exportStep.set('error');
        }
    }

    private startExportHandshakePolling(sessionId: string, listId: string): void {
        this.stopExportHandshakePolling();
        this.exportHandshakePollTimer = setInterval(async () => {
            try {
                await this.store.pollExportHandshake(sessionId, listId);
                this.stopExportHandshakePolling();
                this.exportStep.set('done');
            } catch { }
        }, 2000);
    }

    private stopExportHandshakePolling(): void {
        if (this.exportHandshakePollTimer !== null) {
            clearInterval(this.exportHandshakePollTimer);
            this.exportHandshakePollTimer = null;
        }
    }

    closeDialog(): void {
        this.stopExportHandshakePolling();
        this.exportQrData.set(null);
        this.activeExportSessionId = null;
        this.closed.emit();
    }
}
