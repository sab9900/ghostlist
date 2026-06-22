import { Component, output } from '@angular/core';
import { LucideFlame } from '@lucide/angular';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
    selector: 'app-danger-zone-section',
    imports: [TranslatePipe, LucideFlame],
    templateUrl: './danger-zone-section.component.html',
    styleUrl: './danger-zone-section.component.scss',
})
export class DangerZoneSectionComponent {
    readonly activate = output<void>();
}
