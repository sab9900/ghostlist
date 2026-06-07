import { DatePipe } from '@angular/common';
import { Component, computed, ElementRef, inject, OnDestroy, signal, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { Router } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { ExportQrPayload, ReceiveQrPayload } from '../../core/models';
import { HapticsService } from '../../core/services/haptics.service';
import { BadgeComponent } from '../../shared/badge/badge.component';
import { QrCodeComponent } from '../../shared/qr-code/qr-code.component';
import { QrScannerComponent } from '../../shared/qr-scanner/qr-scanner.component';
import { AppStore } from '../../store/app.store';

@Component({
    selector: 'app-lists',
    imports: [FormsModule, DatePipe, QrCodeComponent, QrScannerComponent, BadgeComponent, TranslatePipe],
    templateUrl: './lists.component.html',
    styleUrl: './lists.component.scss',
})
export class ListsComponent implements OnDestroy {
    protected readonly store = inject(AppStore);
    private readonly router = inject(Router);
    private readonly haptics = inject(HapticsService);

    @ViewChild('createInput') private createInputRef?: ElementRef<HTMLInputElement>;

    // ── burger menu ───────────────────────────────────────────────────────
    protected readonly showMenu = signal(false);
    protected readonly showCoffeeLink = !(Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios');

    toggleMenu(): void { this.showMenu.update(v => !v); }
    closeMenu(): void { this.showMenu.set(false); }

    openImportFromMenu(): void { this.closeMenu(); this.openImportDialog(); }
    openExportFromMenu(): void { this.closeMenu(); this.openExportDialog(); }
    goToSettingsFromMenu(): void { this.closeMenu(); this.router.navigate(['/settings']); }
    openAboutFromMenu(): void { this.closeMenu(); this.router.navigate(['/about']); }

    // ── list ──────────────────────────────────────────────────────────────
    protected readonly lists = computed(() =>
        [...this.store.knownLists()].sort((a, b) => a.name.localeCompare(b.name)),
    );
    protected readonly totalUnread = computed(() => this.store.totalUnread());
    protected readonly activeListId = computed(() => this.store.currentListId());

    // ── create ────────────────────────────────────────────────────────────
    protected readonly showCreateDialog = signal(false);
    protected readonly newListName = signal('');
    protected readonly creating = signal(false);
    protected readonly createError = signal<string | null>(null);

    // ── import (receiver shows QR) ────────────────────────────────────────
    protected readonly showImportDialog = signal(false);
    protected readonly importMode = signal<'show' | 'scan'>('show');
    protected readonly importQrData = signal<string | null>(null);
    protected readonly importPending = signal(false);
    private importPollTimer: ReturnType<typeof setInterval> | null = null;
    private importSessionId: string | null = null;

    // scan-mode state (receiver scans export QR)
    protected readonly scanStep = signal<'scanning' | 'waiting' | 'error'>('scanning');
    private exportSessionId: string | null = null;
    private exportListId: string | null = null;
    private exportListName: string | null = null;
    private exportClaimTimer: ReturnType<typeof setInterval> | null = null;

    // ── export (sender shows QR) ──────────────────────────────────────────
    protected readonly showExportDialog = signal(false);
    protected readonly exportSelectedListId = signal<string | null>(null);
    protected readonly exportQrData = signal<string | null>(null);
    protected readonly exportStep = signal<'pick' | 'qr' | 'done' | 'error'>('pick');
    private exportHandshakePollTimer: ReturnType<typeof setInterval> | null = null;
    private activeExportSessionId: string | null = null;

    ngOnDestroy(): void {
        this.stopImportPolling();
        this.stopExportClaimPolling();
        this.stopExportHandshakePolling();
    }

    // ── navigation ────────────────────────────────────────────────────────
    async openList(id: string): Promise<void> {
        this.haptics.listTap();
        await this.router.navigate(['/list', id]);
    }

    unreadFor(id: string): number {
        return this.store.unreadCounts()[id] ?? 0;
    }

    // ── create ────────────────────────────────────────────────────────────
    openCreateDialog(): void {
        this.newListName.set('');
        this.createError.set(null);
        this.showCreateDialog.set(true);
        setTimeout(() => this.createInputRef?.nativeElement.focus(), 0);
    }

    closeCreateDialog(): void {
        this.showCreateDialog.set(false);
    }

    async createList(): Promise<void> {
        if (this.creating()) return;
        const name = this.newListName().trim();
        if (!name) return;
        this.createError.set(null);
        this.creating.set(true);
        try {
            const key = await this.store.generateKey();
            const id = await this.store.createList(key, name);
            this.closeCreateDialog();
            await this.router.navigate(['/list', id]);
        } catch (e: unknown) {
            this.createError.set(e instanceof Error ? e.message : 'Could not create list. Please try again.');
        } finally {
            this.creating.set(false);
        }
    }

    // ── import ────────────────────────────────────────────────────────────
    async openImportDialog(): Promise<void> {
        this.importMode.set('show');
        this.importQrData.set(null);
        this.scanStep.set('scanning');
        this.showImportDialog.set(true);
        await this.startShowMode();
    }

    closeImportDialog(): void {
        this.stopImportPolling();
        this.stopExportClaimPolling();
        this.showImportDialog.set(false);
        this.importQrData.set(null);
        this.importSessionId = null;
        this.exportSessionId = null;
        this.exportListId = null;
        this.exportListName = null;
    }

    async setImportMode(mode: 'show' | 'scan'): Promise<void> {
        this.stopImportPolling();
        this.stopExportClaimPolling();
        this.importMode.set(mode);
        this.scanStep.set('scanning');
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
                this.showImportDialog.set(false);
                await this.router.navigate(['/list', id]);
            } catch { /* 404 = not yet */ }
        }, 2000);
    }

    private stopImportPolling(): void {
        if (this.importPollTimer !== null) {
            clearInterval(this.importPollTimer);
            this.importPollTimer = null;
        }
    }

    // scan mode (receiver scans export QR from sender)
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
                this.showImportDialog.set(false);
                await this.router.navigate(['/list', id]);
            } catch { /* 404 = not yet */ }
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
        this.exportSessionId = null;
    }

    // ── export ────────────────────────────────────────────────────────────
    openExportDialog(): void {
        const activeId = this.store.currentListId();
        this.exportSelectedListId.set(activeId);
        this.exportQrData.set(null);
        this.exportStep.set(activeId ? 'qr' : 'pick');
        this.showExportDialog.set(true);
        if (activeId) this.startExport(activeId);
    }

    closeExportDialog(): void {
        this.stopExportHandshakePolling();
        this.showExportDialog.set(false);
        this.exportQrData.set(null);
        this.activeExportSessionId = null;
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
            } catch { /* 404 = receiver hasn't scanned yet */ }
        }, 2000);
    }

    private stopExportHandshakePolling(): void {
        if (this.exportHandshakePollTimer !== null) {
            clearInterval(this.exportHandshakePollTimer);
            this.exportHandshakePollTimer = null;
        }
    }
}
