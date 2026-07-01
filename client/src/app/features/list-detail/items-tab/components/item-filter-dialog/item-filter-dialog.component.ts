import { Component, ElementRef, effect, input, output, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideX } from '@lucide/angular';
import { TranslatePipe } from '@ngx-translate/core';
import { ItemSortOrder } from '../../items-tab.types';

@Component({
    selector: 'app-item-filter-dialog',
    imports: [FormsModule, TranslatePipe, LucideX],
    templateUrl: './item-filter-dialog.component.html',
    styleUrl: './item-filter-dialog.component.scss',
})
export class ItemFilterDialogComponent {
    readonly show = input(false);
    readonly query = input('');
    readonly sortOrder = input<ItemSortOrder>('createdAt');

    readonly queryChange = output<string>();
    readonly sortOrderChange = output<ItemSortOrder>();
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

    protected onSortChange(order: ItemSortOrder): void {
        if (order === this.sortOrder()) return;
        this.sortOrderChange.emit(order);
    }
}
