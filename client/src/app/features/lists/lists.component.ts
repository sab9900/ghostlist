import { DatePipe } from '@angular/common';
import { Component, computed, effect, ElementRef, inject, OnDestroy, signal, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { Router } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { ExportQrPayload, ListFullError, ListMember, ReceiveQrPayload } from '../../core/models';
import { HapticsService } from '../../core/services/haptics.service';
import { MasterPasswordService } from '../../core/services/master-password.service';
import { SensitiveListsService } from '../../core/services/sensitive-lists.service';
import { WebAuthnService } from '../../core/services/webauthn.service';
import { AvatarComponent } from '../../shared/avatar/avatar.component';
import { BadgeComponent } from '../../shared/badge/badge.component';
import { QrCodeComponent } from '../../shared/qr-code/qr-code.component';
import { QrScannerComponent } from '../../shared/qr-scanner/qr-scanner.component';
import { AppStore } from '../../store/app.store';

/** Max avatars shown before collapsing the rest into a "+N" badge. */
const MAX_VISIBLE_AVATARS = 3;

@Component({
    selector: 'app-lists',
    imports: [FormsModule, DatePipe, QrCodeComponent, QrScannerComponent, BadgeComponent, AvatarComponent, TranslatePipe],
    templateUrl: './lists.component.html',
    styleUrl: './lists.component.scss',
})
export class ListsComponent implements OnDestroy {
    protected readonly store = inject(AppStore);
    private readonly router = inject(Router);
    private readonly haptics = inject(HapticsService);
    protected readonly sensitiveLists = inject(SensitiveListsService);
    private readonly masterPassword = inject(MasterPasswordService);
    private readonly webAuthn = inject(WebAuthnService);

    private readonly memberLists = signal<Record<string, ListMember[]>>({});
    private readonly memberFetchAttempted = new Set<string>();

    constructor() {
        effect(() => {
            if (!this.store.listsLoaded()) return;
            for (const list of this.store.knownLists()) {
                if (this.memberFetchAttempted.has(list.id)) continue;
                this.memberFetchAttempted.add(list.id);
                void this.loadMembers(list.id, list.encryptionKey);
            }
        });
    }

    private async loadMembers(listId: string, encryptionKey: string): Promise<void> {
        try {
            const members = await this.store.fetchMembersForList(listId, encryptionKey);
            this.memberLists.update(m => ({ ...m, [listId]: members }));
        } catch {
            // Offline or unreachable — leave unset, no avatars shown for this list.
        }
    }

    protected membersFor(listId: string): ListMember[] {
        return this.memberLists()[listId] ?? [];
    }

    protected isShared(listId: string): boolean {
        return this.membersFor(listId).length > 1;
    }

    protected avatarMembers(listId: string): ListMember[] {
        return this.membersFor(listId).slice(0, MAX_VISIBLE_AVATARS);
    }

    protected extraMemberCount(listId: string): number {
        return Math.max(0, this.membersFor(listId).length - MAX_VISIBLE_AVATARS);
    }

    @ViewChild('createInput') private createInputRef?: ElementRef<HTMLInputElement>;

    protected readonly showMenu = signal(false);
    protected readonly showCoffeeLink = !(Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios');

    toggleMenu(): void { this.showMenu.update(v => !v); }
    closeMenu(): void { this.showMenu.set(false); }

    openImportFromMenu(): void { this.closeMenu(); this.openImportDialog(); }
    openExportFromMenu(): void { this.closeMenu(); this.openExportDialog(); }
    goToSettingsFromMenu(): void { this.closeMenu(); this.router.navigate(['/settings']); }
    openAboutFromMenu(): void { this.closeMenu(); this.router.navigate(['/about']); }

    protected readonly hasSensitiveLists = computed(() =>
        this.store.knownLists().some(l => l.isSensitive),
    );

    protected readonly lists = computed(() => {
        const all = this.store.knownLists();
        const visible = this.sensitiveLists.revealed() ? all : all.filter(l => !l.isSensitive);
        return [...visible].sort((a, b) => a.name.localeCompare(b.name));
    });
    protected readonly totalUnread = computed(() => this.store.totalUnread() + this.store.totalUnreadItems());
    protected readonly activeListId = computed(() => this.store.currentListId());

    // --- Sensitive lists reveal (triple-click ghost logo) ---

    private logoClickCount = 0;
    private logoClickTimer: ReturnType<typeof setTimeout> | null = null;

    protected readonly showRevealDialog = signal(false);
    protected readonly revealPassword = signal('');
    protected readonly revealError = signal(false);
    protected readonly revealing = signal(false);

    onLogoClick(): void {
        this.logoClickCount++;
        if (this.logoClickTimer) clearTimeout(this.logoClickTimer);

        if (this.logoClickCount >= 3) {
            this.logoClickCount = 0;
            this.logoClickTimer = null;
            this.onTripleClickLogo();
            return;
        }

        this.logoClickTimer = setTimeout(() => { this.logoClickCount = 0; }, 600);
    }

    private onTripleClickLogo(): void {
        if (this.sensitiveLists.revealed()) {
            this.sensitiveLists.hide();
            return;
        }
        if (!this.hasSensitiveLists()) return;
        this.openRevealDialog();
    }

    openRevealDialog(): void {
        this.revealPassword.set('');
        this.revealError.set(false);
        this.revealing.set(false);
        this.showRevealDialog.set(true);
    }

    closeRevealDialog(): void {
        this.showRevealDialog.set(false);
        this.revealPassword.set('');
    }

    async submitReveal(): Promise<void> {
        if (this.revealing()) return;
        const password = this.revealPassword();
        if (!password) return;

        this.revealing.set(true);
        this.revealError.set(false);
        try {
            const passwordOk = await this.masterPassword.verifyPassword(password);
            if (!passwordOk) {
                this.revealError.set(true);
                return;
            }

            if (this.webAuthn.isEnabled()) {
                const bioOk = await this.webAuthn.authenticate();
                if (!bioOk) {
                    this.revealError.set(true);
                    return;
                }
            }

            this.sensitiveLists.reveal();
            this.closeRevealDialog();
        } finally {
            this.revealing.set(false);
        }
    }

    protected readonly showCreateDialog = signal(false);
    protected readonly newListName = signal('');
    protected readonly creating = signal(false);
    protected readonly createError = signal<string | null>(null);

    protected readonly showImportDialog = signal(false);
    protected readonly importMode = signal<'show' | 'scan'>('show');
    protected readonly importQrData = signal<string | null>(null);
    protected readonly importPending = signal(false);
    private importPollTimer: ReturnType<typeof setInterval> | null = null;
    private importSessionId: string | null = null;

    protected readonly importErrorMsg = signal<string | null>(null);
    protected readonly scanStep = signal<'scanning' | 'waiting' | 'error'>('scanning');
    private exportSessionId: string | null = null;
    private exportListId: string | null = null;
    private exportListName: string | null = null;
    private exportClaimTimer: ReturnType<typeof setInterval> | null = null;

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
        if (this.logoClickTimer) clearTimeout(this.logoClickTimer);
    }

    async openList(id: string): Promise<void> {
        this.haptics.listTap();
        await this.router.navigate(['/list', id]);
    }

    unreadFor(id: string): number {
        return (this.store.unreadCounts()[id] ?? 0) + (this.store.unreadItemCounts()[id] ?? 0);
    }

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

    async openImportDialog(): Promise<void> {
        this.importMode.set('show');
        this.importQrData.set(null);
        this.scanStep.set('scanning');
        this.importErrorMsg.set(null);
        this.showImportDialog.set(true);
        await this.startShowMode();
    }

    closeImportDialog(): void {
        this.stopImportPolling();
        this.stopExportClaimPolling();
        this.showImportDialog.set(false);
        this.importQrData.set(null);
        this.importErrorMsg.set(null);
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
        this.importErrorMsg.set(null);
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
                this.showImportDialog.set(false);
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
            } catch { }
        }, 2000);
    }

    private stopExportHandshakePolling(): void {
        if (this.exportHandshakePollTimer !== null) {
            clearInterval(this.exportHandshakePollTimer);
            this.exportHandshakePollTimer = null;
        }
    }
}
