import { Component, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { ReminderBanner } from '../../items-tab.types';

@Component({
    selector: 'app-reminder-banner',
    imports: [TranslatePipe],
    templateUrl: './reminder-banner.component.html',
    styleUrl: './reminder-banner.component.scss',
})
export class ReminderBannerComponent {
    readonly banner = input<ReminderBanner | null>(null);
    readonly go = output<void>();
    readonly dismiss = output<void>();
}
