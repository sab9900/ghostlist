import { Component, computed, input, output } from '@angular/core';
import { LucideCheck, LucideCircleAlert, LucideCircleHelp, LucideCircleX, LucideClock, LucideEllipsisVertical, LucideTrash2 } from '@lucide/angular';
import { TranslatePipe } from '@ngx-translate/core';
import { ViewportDwellDirective } from '../../../../../core/directives/viewport-dwell.directive';
import { formatReminderDate } from '../../../../../core/utils/reminder-date.util';
import { ActiveReminder, DecryptedItem, ItemPriority } from '../../items-tab.types';

@Component({
    selector: 'app-item-row',
    imports: [TranslatePipe, ViewportDwellDirective, LucideTrash2, LucideClock, LucideEllipsisVertical, LucideCircleX, LucideCheck, LucideCircleAlert, LucideCircleHelp],
    templateUrl: './item-row.component.html',
    styleUrl: './item-row.component.scss',
})
export class ItemRowComponent {
    readonly item = input.required<DecryptedItem>();
    readonly isMenuOpen = input(false);
    readonly menuAbove = input(false);
    readonly highlighted = input(false);
    readonly swipeDx = input(0);
    readonly activeReminder = input<ActiveReminder | undefined>(undefined);
    readonly swipeTriggerDistance = input(64);

    readonly toggle = output<void>();
    readonly delete = output<void>();
    readonly menuToggle = output<MouseEvent>();
    readonly openReminder = output<void>();
    readonly cancelReminder = output<void>();
    readonly setPriority = output<ItemPriority | null>();
    readonly dwellRead = output<string>();
    readonly touchStart = output<TouchEvent>();
    readonly touchMove = output<TouchEvent>();
    readonly touchEnd = output<void>();

    protected readonly reminderStatus = computed((): 'overdue' | 'due-soon' | 'upcoming' | null => {
        const reminder = this.activeReminder();
        if (!reminder) return null;
        const diff = new Date(reminder.remindAt).getTime() - Date.now();
        if (diff < 0) return 'overdue';
        if (diff < 15 * 60 * 1000) return 'due-soon';
        return 'upcoming';
    });

    protected formatReminderDate(isoStr: string): string {
        return formatReminderDate(isoStr);
    }
}
