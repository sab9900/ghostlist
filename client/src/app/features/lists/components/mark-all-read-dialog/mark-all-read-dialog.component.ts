import { Component, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
    selector: 'app-mark-all-read-dialog',
    imports: [TranslatePipe],
    templateUrl: './mark-all-read-dialog.component.html',
    styleUrl: './mark-all-read-dialog.component.scss',
})
export class MarkAllReadDialogComponent {
    readonly show = input(false);
    readonly marking = input(false);

    readonly confirm = output<void>();
    readonly cancel = output<void>();
}
