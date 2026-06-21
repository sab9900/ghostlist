import { Component, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Clipboard } from '@capacitor/clipboard';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
    selector: 'app-recovery-code-dialog',
    imports: [FormsModule, TranslatePipe],
    templateUrl: './recovery-code-dialog.component.html',
    styleUrl: './recovery-code-dialog.component.scss',
})
export class RecoveryCodeDialogComponent {
    readonly code = input<string | null>(null);

    readonly acknowledge = output<void>();

    protected readonly confirmed = signal(false);
    protected readonly copied = signal(false);

    setConfirmed(value: boolean): void {
        this.confirmed.set(value);
    }

    async copyCode(): Promise<void> {
        const code = this.code();
        if (!code) return;
        try {
            await Clipboard.write({ string: code });
            this.copied.set(true);
            setTimeout(() => this.copied.set(false), 2000);
        } catch { }
    }

    submit(): void {
        if (!this.confirmed()) return;
        this.confirmed.set(false);
        this.acknowledge.emit();
    }
}
