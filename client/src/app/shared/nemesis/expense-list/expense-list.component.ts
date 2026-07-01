import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { LucideScale, LucideReceipt } from "@lucide/angular";
import { DecryptedExpense, VerificationStatus } from '../../../core/models/nemesis.model';
import { ListMember } from '../../../core/models';

@Component({
    selector: 'app-expense-list',
    standalone: true,
    imports: [CommonModule, TranslatePipe, LucideScale, LucideReceipt],
    templateUrl: './expense-list.component.html',
    styleUrls: ['./expense-list.component.scss'],
})
export class ExpenseListComponent {
    @Input() expenses: DecryptedExpense[] = [];
    @Input() currentUserId = '';
    @Input() members: ListMember[] = [];
    @Input() sectionLabel: string | null = null;
    @Output() expenseSelected = new EventEmitter<DecryptedExpense>();
    @Output() verifyRequested = new EventEmitter<string>();

    protected readonly VerificationStatus = VerificationStatus;

    get totalMembers(): number {
        return this.members.filter(m => m.userId).length || 1;
    }

    memberName(userId: string): string {
        const m = this.members.find(m => m.userId === userId);
        return m?.displayName ?? userId.slice(0, 8) + '…';
    }

    hasUserVerified(expense: DecryptedExpense): boolean {
        return expense.verifications.some(v => v.verifiedByUserId === this.currentUserId);
    }

    canVerify(expense: DecryptedExpense): boolean {
        return expense.status === VerificationStatus.Pending &&
            !this.hasUserVerified(expense) &&
            expense.splitBetween.includes(this.currentUserId) &&
            expense.paidByUserId !== this.currentUserId;
    }
}
