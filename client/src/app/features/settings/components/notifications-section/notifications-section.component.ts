import { Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
    selector: 'app-notifications-section',
    imports: [FormsModule, TranslatePipe],
    templateUrl: './notifications-section.component.html',
    styleUrl: './notifications-section.component.scss',
})
export class NotificationsSectionComponent {
    readonly permission = input<NotificationPermission | null>(null);
    readonly enabled = input(false);
    readonly enabling = input(false);
    readonly pushActive = input(false);

    readonly toggle = output<boolean>();
}
