import { Component, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { MasterPasswordService } from '../../../../core/services/master-password.service';
import { SensitiveListsService } from '../../../../core/services/sensitive-lists.service';
import { WebAuthnService } from '../../../../core/services/webauthn.service';

@Component({
    selector: 'app-reveal-dialog',
    imports: [FormsModule, TranslatePipe],
    templateUrl: './reveal-dialog.component.html',
    styleUrl: './reveal-dialog.component.scss',
})
export class RevealDialogComponent {
    private readonly masterPassword = inject(MasterPasswordService);
    private readonly webAuthn = inject(WebAuthnService);
    private readonly sensitiveLists = inject(SensitiveListsService);

    readonly show = input(false);
    readonly closed = output<void>();

    protected readonly password = signal('');
    protected readonly error = signal(false);
    protected readonly revealing = signal(false);

    constructor() {
        effect(() => {
            if (this.show()) {
                this.password.set('');
                this.error.set(false);
                this.revealing.set(false);
            }
        });
    }

    async submit(): Promise<void> {
        if (this.revealing()) return;
        const pw = this.password();
        if (!pw) return;
        this.revealing.set(true);
        this.error.set(false);
        try {
            const ok = await this.masterPassword.verifyPassword(pw);
            if (!ok) { this.error.set(true); return; }
            if (this.webAuthn.isEnabled()) {
                const bioOk = await this.webAuthn.authenticate();
                if (!bioOk) { this.error.set(true); return; }
            }
            this.sensitiveLists.reveal();
            this.closed.emit();
        } finally {
            this.revealing.set(false);
        }
    }

    close(): void {
        this.password.set('');
        this.closed.emit();
    }
}
