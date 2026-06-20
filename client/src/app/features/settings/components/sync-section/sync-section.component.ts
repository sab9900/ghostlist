import { Component, input, output } from '@angular/core';
import { LucideRefreshCw } from '@lucide/angular';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
    selector: 'app-sync-section',
    imports: [TranslatePipe, LucideRefreshCw],
    templateUrl: './sync-section.component.html',
    styleUrl: './sync-section.component.scss',
})
export class SyncSectionComponent {
    readonly webAuthnEnabled = input(false);
    readonly syncStep = input('idle');
    readonly syncImportedCount = input(0);

    readonly startSync = output<void>();
}
