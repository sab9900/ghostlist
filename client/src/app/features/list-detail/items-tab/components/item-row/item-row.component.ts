import { Component, input, output } from '@angular/core';
import { LucideCheck, LucideCircleX, LucideClock, LucideEllipsisVertical, LucideTrash2 } from '@lucide/angular';
import { TranslatePipe } from '@ngx-translate/core';
import { ViewportDwellDirective } from '../../../../../core/directives/viewport-dwell.directive';
import { ActiveReminder, DecryptedItem } from '../../items-tab.types';

@Component({
    selector: 'app-item-row',
    imports: [TranslatePipe, ViewportDwellDirective, LucideTrash2, LucideClock, LucideEllipsisVertical, LucideCircleX, LucideCheck],
    templateUrl: './item-row.component.html',
    styleUrl: './item-row.component.scss',
})
export class ItemRowComponent {
    readonly item = input.required<DecryptedItem>();
    readonly isMenuOpen = input(false);
    readonly menuAbove = input(false);
    readonly swipeDx = input(0);
    readonly activeReminder = input<ActiveReminder | undefined>(undefined);
    readonly swipeTriggerDistance = input(64);

    readonly toggle = output<void>();
    readonly delete = output<void>();
    readonly menuToggle = output<MouseEvent>();
    readonly openReminder = output<void>();
    readonly cancelReminder = output<void>();
    readonly dwellRead = output<string>();
    readonly touchStart = output<TouchEvent>();
    readonly touchMove = output<TouchEvent>();
    readonly touchEnd = output<void>();

    protected formatReminderDate(isoStr: string): string {
        const d = new Date(isoStr);
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const startOfTomorrow = new Date(startOfToday.getTime() + 86_400_000);
        const startOfDayAfter = new Date(startOfTomorrow.getTime() + 86_400_000);
        const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        if (d >= startOfToday && d < startOfTomorrow) return timeStr;
        if (d >= startOfTomorrow && d < startOfDayAfter) return `+1d ${timeStr}`;
        return d.toLocaleDateString([], { day: 'numeric', month: 'numeric' }) + ' ' + timeStr;
    }
}
