import { DatePipe } from '@angular/common';
import { Component, computed, ElementRef, inject, OnDestroy, signal, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ReceiveQrPayload } from '../../core/models';
import { Theme, ThemeService } from '../../core/services/theme.service';
import { BadgeComponent } from '../../shared/badge/badge.component';
import { QrCodeComponent } from '../../shared/qr-code/qr-code.component';
import { AppStore } from '../../store/app.store';

@Component({
    selector: 'app-lists',
    imports: [FormsModule, DatePipe, QrCodeComponent, BadgeComponent],
    templateUrl: './lists.component.html',
    styleUrl: './lists.component.scss',
})
export class ListsComponent implements OnDestroy {
    protected readonly store = inject(AppStore);
    private readonly router = inject(Router);
    protected readonly themeService = inject(ThemeService);

    protected readonly showThemePopover = signal(false);

    toggleThemePopover(): void {
        this.showThemePopover.update(v => !v);
    }

    setTheme(theme: Theme): void {
        this.themeService.set(theme);
        this.showThemePopover.set(false);
    }

    @ViewChild('createInput') private createInputRef?: ElementRef<HTMLInputElement>;

    protected readonly showCreateDialog = signal(false);
    protected readonly newListName = signal('');
    protected readonly creating = signal(false);

    protected readonly showImportDialog = signal(false);
    protected readonly importQrData = signal<string | null>(null);
    protected readonly importPending = signal(false);
    protected readonly importName = signal('');
    private importPollTimer: ReturnType<typeof setInterval> | null = null;
    private importSessionId: string | null = null;

    protected readonly lists = computed(() =>
        [...this.store.knownLists()].sort((a, b) => a.name.localeCompare(b.name)),
    );
    protected readonly totalUnread = computed(() => this.store.totalUnread());
    protected readonly activeListId = computed(() => this.store.currentListId());

    ngOnDestroy(): void {
        this.stopPolling();
    }

    openCreateDialog(): void {
        this.newListName.set('');
        this.showCreateDialog.set(true);
        setTimeout(() => this.createInputRef?.nativeElement.focus(), 0);
    }

    closeCreateDialog(): void {
        this.showCreateDialog.set(false);
    }

    async createList(): Promise<void> {
        const name = this.newListName().trim();
        if (!name) return;
        this.creating.set(true);
        try {
            const key = await this.store.generateKey();
            const id = await this.store.createList(key, name);
            this.closeCreateDialog();
            await this.router.navigate(['/list', id]);
        } finally {
            this.creating.set(false);
        }
    }

    async openImportDialog(): Promise<void> {
        this.importName.set('');
        this.importQrData.set(null);
        this.importPending.set(true);
        this.showImportDialog.set(true);

        try {
            const payload: ReceiveQrPayload = await this.store.initReceive();
            this.importSessionId = payload.sessionId;
            this.importQrData.set(JSON.stringify(payload));
            this.startPolling(payload.sessionId);
        } catch {
            this.importPending.set(false);
        }
    }

    closeImportDialog(): void {
        this.stopPolling();
        this.showImportDialog.set(false);
        this.importQrData.set(null);
        this.importSessionId = null;
    }

    private startPolling(sessionId: string): void {
        this.stopPolling();
        this.importPollTimer = setInterval(async () => {
            if (!this.importName().trim()) return;
            try {
                const id = await this.store.claimSharedKey(sessionId, this.importName().trim());
                this.stopPolling();
                this.showImportDialog.set(false);
                await this.router.navigate(['/list', id]);
            } catch {

            }
        }, 2000);
    }

    private stopPolling(): void {
        if (this.importPollTimer !== null) {
            clearInterval(this.importPollTimer);
            this.importPollTimer = null;
        }
    }

    async openList(id: string): Promise<void> {
        await this.router.navigate(['/list', id]);
    }

    unreadFor(id: string): number {
        return this.store.unreadCounts()[id] ?? 0;
    }
}
