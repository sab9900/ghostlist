import { Component, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { OverlayComponent } from '../../../../shared/overlay/overlay.component';

@Component({
    selector: 'app-mark-all-read-dialog',
    imports: [OverlayComponent, TranslatePipe],
    templateUrl: './mark-all-read-dialog.component.html',
    styleUrl: './mark-all-read-dialog.component.scss',
})
export class MarkAllReadDialogComponent {
    readonly show = input(false);
    readonly marking = input(false);

    readonly confirm = output<void>();
    readonly cancel = output<void>();
}
