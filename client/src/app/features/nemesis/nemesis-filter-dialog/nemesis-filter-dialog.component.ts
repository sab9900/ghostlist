import { Component, ElementRef, effect, input, output, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideX } from '@lucide/angular';
import { TranslatePipe } from '@ngx-translate/core';
import { NemesisExpenseSortOrder, NemesisSettlementSortOrder } from '../nemesis-dashboard/nemesis-dashboard.types';
import { OverlayComponent } from '../../../shared/overlay/overlay.component';

@Component({
    selector: 'app-nemesis-filter-dialog',
    imports: [OverlayComponent, FormsModule, TranslatePipe, LucideX],
    templateUrl: './nemesis-filter-dialog.component.html',
    styleUrl: './nemesis-filter-dialog.component.scss',
})
export class NemesisFilterDialogComponent {
    readonly show = input(false);
    readonly mode = input<'expenses' | 'settlements'>('expenses');
    readonly query = input('');
    readonly expenseSortOrder = input<NemesisExpenseSortOrder>('createdAt');
    readonly settlementSortOrder = input<NemesisSettlementSortOrder>('amount');

    readonly queryChange = output<string>();
    readonly expenseSortOrderChange = output<NemesisExpenseSortOrder>();
    readonly settlementSortOrderChange = output<NemesisSettlementSortOrder>();
    readonly closed = output<void>();

    private readonly inputRef = viewChild<ElementRef<HTMLInputElement>>('input');

    constructor() {
        effect(() => {
            if (this.show()) setTimeout(() => this.inputRef()?.nativeElement.focus(), 0);
        });
    }

    protected onQueryChange(value: string): void {
        this.queryChange.emit(value);
    }

    protected onExpenseSortChange(order: NemesisExpenseSortOrder): void {
        if (order === this.expenseSortOrder()) return;
        this.expenseSortOrderChange.emit(order);
    }

    protected onSettlementSortChange(order: NemesisSettlementSortOrder): void {
        if (order === this.settlementSortOrder()) return;
        this.settlementSortOrderChange.emit(order);
    }
}
