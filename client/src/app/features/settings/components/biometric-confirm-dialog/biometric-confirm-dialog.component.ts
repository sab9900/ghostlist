import { Component, effect, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
    selector: 'app-biometric-confirm-dialog',
    imports: [FormsModule, TranslatePipe],
    templateUrl: './biometric-confirm-dialog.component.html',
    styleUrl: './biometric-confirm-dialog.component.scss',
})
export class BiometricConfirmDialogComponent {
    readonly show = input(false);
    readonly working = input(false);
    readonly error = input(false);

    readonly submitPassword = output<string>();
    readonly cancel = output<void>();

    protected readonly password = signal('');

    constructor() {
        effect(() => {
            if (this.show()) this.password.set('');
        });
    }

    submit(): void {
        const pw = this.password();
        if (!pw || this.working()) return;
        this.submitPassword.emit(pw);
    }
}
