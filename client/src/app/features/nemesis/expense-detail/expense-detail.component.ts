import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { DecryptedExpense, VerificationStatus } from '../../../core/models/nemesis.model';
import { ListMember } from '../../../core/models';

@Component({
    selector: 'app-expense-detail',
    standalone: true,
    imports: [CommonModule, TranslatePipe],
    templateUrl: './expense-detail.component.html',
    styleUrls: ['./expense-detail.component.scss'],
})
export class ExpenseDetailComponent {
    @Input() expense!: DecryptedExpense;
    @Input() currentUserId = '';
    @Input() members: ListMember[] = [];
    @Input() receiptDataUrl: string | null = null;
    @Input() receiptError = false;
    @Output() verifyRequested = new EventEmitter<string>();
    @Output() rejectRequested = new EventEmitter<string>();
    @Output() closed = new EventEmitter<void>();
    @Output() receiptOpened = new EventEmitter<string>();

    protected readonly VerificationStatus = VerificationStatus;

    memberName(userId: string): string {
        const m = this.members.find(m => m.userId === userId);
        return m?.displayName ?? userId.slice(0, 8) + '…';
    }

    get hasUserVerified(): boolean {
        return this.expense.verifications.some(v => v.verifiedByUserId === this.currentUserId);
    }

    get isInSplit(): boolean {
        return this.expense.splitBetween.includes(this.currentUserId);
    }

    get isNonPayerSplitMember(): boolean {
        return this.isInSplit && this.currentUserId !== this.expense.paidByUserId;
    }

    get canVerify(): boolean {
        return this.expense.status === VerificationStatus.Pending &&
            !this.hasUserVerified &&
            this.isNonPayerSplitMember;
    }

    get canReject(): boolean {
        return this.expense.status === VerificationStatus.Pending && this.isNonPayerSplitMember;
    }

    get sharePerPerson(): number {
        if (!this.expense.splitBetween.length) return 0;
        return Math.round((this.expense.amount / this.expense.splitBetween.length) * 100) / 100;
    }

    get receiptLoading(): boolean {
        return this.expense.hasReceipt && !this.receiptDataUrl && !this.receiptError;
    }

    openReceipt(): void {
        if (this.receiptDataUrl) this.receiptOpened.emit(this.receiptDataUrl);
    }
}
