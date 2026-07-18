import { Component, effect, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { DecryptedItem } from '../../items-tab.types';
import { OverlayComponent } from '../../../../../shared/overlay/overlay.component';

@Component({
    selector: 'app-reminder-dialog',
    imports: [OverlayComponent, FormsModule, TranslatePipe],
    templateUrl: './reminder-dialog.component.html',
    styleUrl: './reminder-dialog.component.scss',
})
export class ReminderDialogComponent {
    readonly item = input<DecryptedItem | null>(null);
    readonly minDateTime = input('');
    readonly saved = input(false);
    readonly saving = input(false);

    readonly save = output<string>();
    readonly close = output<void>();
    readonly downloadIcal = output<void>();

    protected dateTime = '';

    constructor() {
        effect(() => {
            if (this.item()) {
                const d = new Date(Math.ceil(Date.now() / 60_000) * 60_000);
                const pad = (n: number) => String(n).padStart(2, '0');
                this.dateTime = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
            }
        });
    }

    protected submit(): void {
        if (!this.dateTime || this.saving()) return;
        this.save.emit(this.dateTime);
    }
}
