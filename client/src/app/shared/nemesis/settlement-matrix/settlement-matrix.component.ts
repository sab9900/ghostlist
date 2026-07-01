import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { DebtEntry, DecryptedSettlement, SettlementStatus } from '../../../core/models/nemesis.model';
import { ListMember } from '../../../core/models';

@Component({
    selector: 'app-settlement-matrix',
    standalone: true,
    imports: [CommonModule, TranslatePipe],
    templateUrl: './settlement-matrix.component.html',
    styleUrls: ['./settlement-matrix.component.scss'],
})
export class SettlementMatrixComponent {
    @Input() debts: DebtEntry[] = [];
    @Input() settlements: DecryptedSettlement[] = [];
    @Input() currentUserId = '';
    @Input() members: ListMember[] = [];
    @Input() highlightedToUserId: string | null = null;
    @Output() settleRequested = new EventEmitter<DebtEntry>();
    @Output() confirmSettlementRequested = new EventEmitter<string>();
    @Output() declineSettlementRequested = new EventEmitter<string>();
    @Output() forgiveSettlementRequested = new EventEmitter<string>();

    readonly SettlementStatus = SettlementStatus;

    memberName(userId: string): string {
        const m = this.members.find(m => m.userId === userId);
        return m?.displayName ?? userId.slice(0, 8) + '…';
    }

    settlementStatusKey(status: SettlementStatus): string {
        switch (status) {
            case SettlementStatus.Pending: return 'NEMESIS.SETTLEMENT_STATUS_PENDING';
            case SettlementStatus.Confirmed: return 'NEMESIS.SETTLEMENT_STATUS_CONFIRMED';
            case SettlementStatus.Declined: return 'NEMESIS.SETTLEMENT_STATUS_DECLINED';
            case SettlementStatus.Expired: return 'NEMESIS.SETTLEMENT_STATUS_EXPIRED';
            case SettlementStatus.Voided: return 'NEMESIS.SETTLEMENT_STATUS_VOIDED';
            case SettlementStatus.Forgiven: return 'NEMESIS.SETTLEMENT_STATUS_FORGIVEN';
        }
    }

    settlementStatusMod(status: SettlementStatus): string {
        switch (status) {
            case SettlementStatus.Confirmed: return 'confirmed';
            case SettlementStatus.Declined: return 'declined';
            case SettlementStatus.Expired: return 'expired';
            case SettlementStatus.Voided: return 'voided';
            case SettlementStatus.Forgiven: return 'forgiven';
            default: return 'pending';
        }
    }

    get myDebts(): DebtEntry[] {
        return this.debts.filter(d => d.fromUserId === this.currentUserId);
    }

    get othersOweMe(): DebtEntry[] {
        return this.debts.filter(d => d.toUserId === this.currentUserId);
    }

    get pendingConfirmations(): DecryptedSettlement[] {
        return this.settlements.filter(s => {
            if (s.status !== SettlementStatus.Pending) return false;
            if (s.toUserId) return s.toUserId === this.currentUserId;
            return s.payerUserId !== null && s.payerUserId !== this.currentUserId;
        });
    }

    get resolvedSettlements(): DecryptedSettlement[] {
        const terminal = [
            SettlementStatus.Declined,
            SettlementStatus.Expired,
            SettlementStatus.Voided,
            SettlementStatus.Forgiven,
        ];
        return this.settlements.filter(s =>
            terminal.includes(s.status) &&
            (s.fromUserId === this.currentUserId || s.toUserId === this.currentUserId)
        );
    }

    pendingSettlementId(debt: DebtEntry): string | null {
        const s = this.settlements.find(s =>
            s.fromUserId === debt.fromUserId &&
            s.toUserId === debt.toUserId &&
            s.currency === debt.currency &&
            s.status === SettlementStatus.Pending
        );
        return s?.id ?? null;
    }
}
