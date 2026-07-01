import { Component, ElementRef, effect, input, output, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideX } from '@lucide/angular';
import { TranslatePipe } from '@ngx-translate/core';
import { NemesisExpenseSortOrder, NemesisSettlementSortOrder } from '../nemesis-dashboard/nemesis-dashboard.types';
import { animateOverlayClose } from '../../../core/utils/sheet-transition.util';

@Component({
    selector: 'app-nemesis-filter-dialog',
    imports: [FormsModule, TranslatePipe, LucideX],
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
    private readonly backdropRef = viewChild<ElementRef<HTMLElement>>('backdrop');

    // @if renders on (show() || closing()) so the dialog stays mounted long enough to play its
    // exit animation — closed only actually fires (letting the parent flip show() to false)
    // once that animation has finished.
    protected readonly closing = signal(false);

    constructor() {
        effect(() => {
            if (this.show()) setTimeout(() => this.inputRef()?.nativeElement.focus(), 0);
        });
    }

    protected async requestClose(): Promise<void> {
        if (this.closing()) return;
        this.closing.set(true);
        await animateOverlayClose(this.backdropRef()?.nativeElement);
        this.closing.set(false);
        this.closed.emit();
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
