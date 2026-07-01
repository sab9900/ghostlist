import { Component, ElementRef, OnInit, ViewChild, computed, effect, inject, signal, untracked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { LucideX } from '@lucide/angular';
import { NemesisStore } from '../../../store/nemesis/nemesis.store';
import { UserIdService } from '../../../core/services/user-id.service';
import { SettlementMatrixComponent } from '../../../shared/nemesis/settlement-matrix/settlement-matrix.component';
import { NemesisFilterDialogComponent } from '../nemesis-filter-dialog/nemesis-filter-dialog.component';
import { DebtEntry } from '../../../core/models/nemesis.model';
import { NemesisSettlementSortOrder } from '../nemesis-dashboard/nemesis-dashboard.types';
import { animateOverlayClose } from '../../../core/utils/sheet-transition.util';

@Component({
    selector: 'app-nemesis-settlements-panel',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        TranslatePipe,
        LucideX,
        SettlementMatrixComponent,
        NemesisFilterDialogComponent,
    ],
    templateUrl: './nemesis-settlements-panel.component.html',
    styleUrls: ['./nemesis-settlements-panel.component.scss'],
})
export class NemesisSettlementsPanelComponent implements OnInit {
    protected readonly store = inject(NemesisStore);
    private readonly userIdService = inject(UserIdService);

    protected readonly filterOpen = signal(false);
    protected readonly searchQuery = signal('');
    protected readonly sortOrder = signal<NemesisSettlementSortOrder>('amount');
    protected readonly highlightedDebtToUserId = signal<string | null>(null);
    protected readonly pendingSettlementDebt = signal<DebtEntry | null>(null);
    protected readonly pendingSettlementAmount = signal<number>(0);

    @ViewChild('settleOverlay') private settleOverlayRef?: ElementRef<HTMLElement>;

    constructor() {
        effect(() => {
            const toUserId = this.store.justConfirmedDebtToUserId();
            untracked(() => {
                if (!toUserId) return;
                this.highlightedDebtToUserId.set(toUserId);
                setTimeout(() => {
                    this.highlightedDebtToUserId.set(null);
                    this.store.setJustConfirmedDebt(null);
                }, 5000);
            });
        });
    }

    ngOnInit(): void {
        void this.store.loadData();
    }

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

    private memberNameById(userId: string): string {
        const m = this.store.members().find(m => m.userId === userId);
        return m?.displayName ?? userId.slice(0, 8) + '…';
    }

    protected readonly filteredDebts = computed(() => {
        const q = this.searchQuery().trim().toLowerCase();
        const order = this.sortOrder();
        let items = [...this.store.minimizedDebts()];
        if (q) {
            items = items.filter(d =>
                this.memberNameById(d.fromUserId).toLowerCase().includes(q) ||
                this.memberNameById(d.toUserId).toLowerCase().includes(q),
            );
        }
        if (order === 'az') {
            return items.sort((a, b) =>
                this.memberNameById(a.fromUserId).localeCompare(this.memberNameById(b.fromUserId)),
            );
        }
        return items.sort((a, b) => b.amount - a.amount);
    });

    protected readonly filteredSettlements = computed(() => {
        const q = this.searchQuery().trim().toLowerCase();
        if (!q) return this.store.decryptedSettlements();
        return this.store.decryptedSettlements().filter(s =>
            this.memberNameById(s.fromUserId).toLowerCase().includes(q) ||
            this.memberNameById(s.toUserId).toLowerCase().includes(q),
        );
    });

    protected readonly filterActive = computed(() =>
        !!this.searchQuery() || this.sortOrder() !== 'amount',
    );

    protected openSettleDialog(debt: DebtEntry): void {
        this.pendingSettlementDebt.set(debt);
        this.pendingSettlementAmount.set(debt.amount);
    }

    protected async closeSettleDialog(): Promise<void> {
        if (!this.pendingSettlementDebt()) return;
        await animateOverlayClose(this.settleOverlayRef?.nativeElement);
        this.pendingSettlementDebt.set(null);
    }

    protected async confirmSettle(): Promise<void> {
        const debt = this.pendingSettlementDebt();
        const amount = this.pendingSettlementAmount();
        if (!debt || amount <= 0) return;
        await this.store.submitSettlement({
            fromUserId: debt.fromUserId,
            toUserId: debt.toUserId,
            amount,
            currency: debt.currency,
        });
        await this.closeSettleDialog();
    }

    protected async onConfirmSettlementRequested(settlementId: string): Promise<void> {
        await this.store.confirmSettlement(settlementId);
    }

    protected async onDeclineSettlementRequested(settlementId: string): Promise<void> {
        await this.store.declineSettlement(settlementId);
    }

    protected async onForgiveSettlementRequested(settlementId: string): Promise<void> {
        await this.store.forgiveSettlement(settlementId);
    }
}
