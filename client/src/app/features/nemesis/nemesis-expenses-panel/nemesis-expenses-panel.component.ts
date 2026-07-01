import { Component, computed, effect, ElementRef, inject, Injector, signal, untracked, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { LucideCamera, LucideCheck, LucidePaperclip, LucidePlus, LucideX } from '@lucide/angular';
import { NemesisStore } from '../../../store/nemesis/nemesis.store';
import { UserIdService } from '../../../core/services/user-id.service';
import { ImageViewerService } from '../../../core/services/image-viewer.service';
import { OcrService } from '../../../core/services/ocr.service';
import { PdfRenderService } from '../../../core/services/pdf-render.service';
import { ShareHandlerService } from '../../../core/services/share-handler.service';
import { ExpenseListComponent } from '../../../shared/nemesis/expense-list/expense-list.component';
import { ReceiptScannerComponent, ScanConfirmResult } from '../../../shared/nemesis/receipt-scanner/receipt-scanner.component';
import { ExpenseDetailComponent } from '../expense-detail/expense-detail.component';
import { DecryptedExpense, VerificationStatus } from '../../../core/models/nemesis.model';
import { NemesisFilterDialogComponent } from '../nemesis-filter-dialog/nemesis-filter-dialog.component';
import { NemesisExpenseSortOrder } from '../nemesis-dashboard/nemesis-dashboard.types';
import { animateOverlayClose } from '../../../core/utils/sheet-transition.util';

@Component({
    selector: 'app-nemesis-expenses-panel',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        TranslatePipe,
        LucideCamera,
        LucideCheck,
        LucidePaperclip,
        LucidePlus,
        LucideX,
        ExpenseListComponent,
        ReceiptScannerComponent,
        ExpenseDetailComponent,
        NemesisFilterDialogComponent,
    ],
    templateUrl: './nemesis-expenses-panel.component.html',
    styleUrls: ['./nemesis-expenses-panel.component.scss'],
})
export class NemesisExpensesPanelComponent {
    protected readonly store = inject(NemesisStore);
    private readonly userIdService = inject(UserIdService);
    private readonly imageViewer = inject(ImageViewerService);
    private readonly translate = inject(TranslateService);
    private readonly injector = inject(Injector);
    private readonly ocr = inject(OcrService);
    private readonly pdfRender = inject(PdfRenderService);
    private readonly shareHandler = inject(ShareHandlerService);

    @ViewChild('directFileInput') private directFileInputRef!: ElementRef<HTMLInputElement>;
    @ViewChild('addSheetOverlay') private addSheetOverlayRef?: ElementRef<HTMLElement>;
    @ViewChild('detailOverlay') private detailOverlayRef?: ElementRef<HTMLElement>;

    protected showScanner = false;
    protected readonly showAddSheet = signal(false);
    protected readonly selectedExpense = signal<DecryptedExpense | null>(null);

    protected pendingReceipt: { blob: Blob; detectedAmount: number | null } | null = null;

    protected newExpense = {
        description: '',
        amount: null as number | null,
        currency: 'EUR',
        paidByUserId: '',
        splitBetween: [] as string[],
    };

    constructor() {
        // A file arrived via the OS/PWA share sheet targeting Nemesis (e.g. a PDF or photo of
        // an invoice shared from Mail/Photos). The add-expense sheet isn't open yet — open it,
        // then run the shared file through the same PDF-render + OCR pipeline as a manual upload.
        effect(() => {
            const payload = this.shareHandler.pendingPayload();
            if (!payload || !payload.confirmed || payload.target !== 'nemesis') return;
            untracked(() => {
                const file = payload.files[0];
                this.shareHandler.consume();
                if (file) {
                    this.openAddSheet();
                    void this.processReceiptFile(file);
                }
            });
        });
    }

    protected readonly filterOpen = signal(false);
    protected readonly searchQuery = signal('');
    protected readonly sortOrder = signal<NemesisExpenseSortOrder>('createdAt');

    get currentUserId(): string {
        return this.userIdService.userId();
    }

    get uniqueMembers() {
        const seen = new Set<string>();
        return this.store.members().filter(m => {
            const key = m.userId ?? m.deviceId;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    protected readonly sortedExpenses = computed(() => {
        const userId = this.currentUserId;
        const order = this.sortOrder();
        const items = [...this.store.decryptedExpenses().filter(e =>
            e.status === VerificationStatus.Pending &&
            (e.splitBetween.includes(userId) || e.paidByUserId === userId)
        )];
        if (order === 'az') return items.sort((a, b) => a.description.localeCompare(b.description));
        if (order === 'za') return items.sort((a, b) => b.description.localeCompare(a.description));
        if (order === 'amount') return items.sort((a, b) => b.amount - a.amount);
        return items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    });

    protected readonly filteredExpenses = computed(() => {
        const q = this.searchQuery().trim().toLowerCase();
        if (!q) return this.sortedExpenses();
        return this.sortedExpenses().filter(e => e.description.toLowerCase().includes(q));
    });

    protected readonly filterActive = computed(() =>
        !!this.searchQuery() || this.sortOrder() !== 'createdAt',
    );

    protected readonly selectedReceiptUrl = computed(() => {
        const expense = this.selectedExpense();
        if (!expense) return null;
        return this.store.receiptDataUrls()[expense.id] ?? null;
    });

    protected readonly selectedReceiptError = computed(() => {
        const expense = this.selectedExpense();
        if (!expense) return false;
        return this.store.receiptLoadErrors()[expense.id] ?? false;
    });

    initial(name: string): string {
        return name.trim().charAt(0).toUpperCase();
    }

    protected get allSplitSelected(): boolean {
        const ids = this.uniqueMembers.filter(m => m.userId).map(m => m.userId!);
        return ids.length > 0 && ids.every(id => this.newExpense.splitBetween.includes(id));
    }

    protected toggleAllSplit(): void {
        const ids = this.uniqueMembers.filter(m => m.userId).map(m => m.userId!);
        this.newExpense.splitBetween = this.allSplitSelected ? [] : [...ids];
    }

    protected isSplitMember(userId: string): boolean {
        return this.newExpense.splitBetween.includes(userId);
    }

    protected toggleSplitMember(userId: string): void {
        const idx = this.newExpense.splitBetween.indexOf(userId);
        if (idx === -1) {
            this.newExpense.splitBetween = [...this.newExpense.splitBetween, userId];
        } else {
            this.newExpense.splitBetween = this.newExpense.splitBetween.filter(id => id !== userId);
        }
    }

    protected openAddSheet(): void {
        this.newExpense.paidByUserId = this.currentUserId;
        this.newExpense.splitBetween = this.uniqueMembers.filter(m => m.userId).map(m => m.userId!);
        this.showAddSheet.set(true);
    }

    protected async closeAddSheet(): Promise<void> {
        if (!this.showAddSheet()) return;
        await animateOverlayClose(this.addSheetOverlayRef?.nativeElement);
        this.showAddSheet.set(false);
        this.resetForm();
    }

    protected onExpenseSelected(expense: DecryptedExpense): void {
        this.selectedExpense.set(expense);
        if (expense.hasReceipt) void this.store.fetchAndCacheReceipt(expense.id);
    }

    protected async onDetailClosed(): Promise<void> {
        if (!this.selectedExpense()) return;
        await animateOverlayClose(this.detailOverlayRef?.nativeElement);
        this.selectedExpense.set(null);
    }

    protected onReceiptOpened(dataUrl: string): void {
        this.imageViewer.open(dataUrl, this.translate.instant('NEMESIS.RECEIPT_ATTACHED'));
    }

    protected onVerifyRequested(expenseId: string): void {
        void this.store.verifyExpense(expenseId);
        if (this.selectedExpense()?.id === expenseId) void this.onDetailClosed();
    }

    protected async onRejectRequested(expenseId: string): Promise<void> {
        await this.store.rejectExpense(expenseId);
        await this.onDetailClosed();
    }

    protected openScanner(): void {
        this.showScanner = true;
    }

    protected onScanConfirmed(result: ScanConfirmResult): void {
        this.showScanner = false;
        this.pendingReceipt = { blob: result.blob, detectedAmount: result.detectedAmount };
        if (result.detectedAmount !== null) this.newExpense.amount = result.detectedAmount;
        if (result.detectedDescription && !this.newExpense.description) {
            this.newExpense.description = result.detectedDescription;
        }
    }

    protected onScanCancelled(): void {
        this.showScanner = false;
    }

    protected triggerDirectFileInput(): void {
        this.directFileInputRef.nativeElement.click();
    }

    protected async onDirectFileSelected(event: Event): Promise<void> {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        input.value = '';
        if (!file) return;
        await this.processReceiptFile(file);
    }

    // Shared by the manual upload button and by files arriving through the OS/PWA share sheet.
    // Renders PDFs to an image first (Tesseract can't read PDF directly), then runs OCR and
    // prefills the currently-open add-expense form. Failures (bad PDF, OCR timeout) are caught
    // so the user still ends up with a working form instead of a silently-broken sheet.
    private async processReceiptFile(file: Blob): Promise<void> {
        let imageBlob: Blob = file;
        if (file.type === 'application/pdf') {
            try {
                imageBlob = await this.pdfRender.renderFirstPageToBlob(file);
            } catch {
                return;
            }
        }

        let detectedAmount: number | null = null;
        let detectedDescription: string | null = null;
        try {
            const result = await this.ocr.scan(imageBlob);
            detectedAmount = result.detectedAmount;
            detectedDescription = this.ocr.extractDescription(result.text);
        } catch {
            // no OCR data — the user can still fill the form manually with the receipt attached
        }

        this.pendingReceipt = { blob: imageBlob, detectedAmount };
        if (detectedAmount !== null) this.newExpense.amount = detectedAmount;
        if (detectedDescription && !this.newExpense.description) this.newExpense.description = detectedDescription;
    }

    protected autoResizeDesc(event: Event): void {
        const el = event.target as HTMLTextAreaElement;
        el.style.height = 'auto';
        el.style.height = `${el.scrollHeight}px`;
    }

    protected get canSubmit(): boolean {
        return !!this.newExpense.description &&
            (this.newExpense.amount ?? 0) > 0 &&
            !!this.newExpense.paidByUserId;
    }

    protected async submitExpense(): Promise<void> {
        const allMemberIds = this.uniqueMembers.filter(m => m.userId).map(m => m.userId!);
        const splitBetween = this.newExpense.splitBetween.length > 0
            ? this.newExpense.splitBetween
            : allMemberIds.length > 0 ? allMemberIds : [this.newExpense.paidByUserId || this.currentUserId];

        await this.store.addExpense({
            amount: this.newExpense.amount ?? 0,
            currency: this.newExpense.currency,
            description: this.newExpense.description,
            paidByUserId: this.newExpense.paidByUserId || this.currentUserId,
            splitBetween,
        }, this.pendingReceipt?.blob);
        await this.closeAddSheet();
    }

    private resetForm(): void {
        this.newExpense = {
            description: '',
            amount: null,
            currency: 'EUR',
            paidByUserId: this.currentUserId,
            splitBetween: [],
        };
        this.pendingReceipt = null;
    }
}
