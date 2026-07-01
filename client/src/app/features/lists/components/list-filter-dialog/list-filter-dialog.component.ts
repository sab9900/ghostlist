import { Component, ElementRef, effect, input, output, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideX } from '@lucide/angular';
import { TranslatePipe } from '@ngx-translate/core';
import { ListSortOrder } from '../../../../core/services/user-preferences.service';

@Component({
    selector: 'app-list-filter-dialog',
    imports: [FormsModule, TranslatePipe, LucideX],
    templateUrl: './list-filter-dialog.component.html',
    styleUrl: './list-filter-dialog.component.scss',
})
export class ListFilterDialogComponent {
    readonly show = input(false);
    readonly query = input('');
    readonly sortOrder = input<ListSortOrder>('name');

    readonly queryChange = output<string>();
    readonly sortOrderChange = output<ListSortOrder>();
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

    protected onSortChange(order: ListSortOrder): void {
        if (order === this.sortOrder()) return;
        this.sortOrderChange.emit(order);
    }
}
