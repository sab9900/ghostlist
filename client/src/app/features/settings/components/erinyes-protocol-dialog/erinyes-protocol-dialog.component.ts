import { Component, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideCircleCheckBig, LucideDoorOpen, LucideFlame, LucideLoaderCircle, LucideShieldOff, LucideTrash2 } from '@lucide/angular';
import { TranslatePipe } from '@ngx-translate/core';
import { ErinyesProtocolService, ErinyesStep } from '../../../../core/services/erinyes-protocol.service';
import { MasterPasswordService } from '../../../../core/services/master-password.service';
import { WebAuthnService } from '../../../../core/services/webauthn.service';
import { GhostMistComponent } from '../../../../shared/ghost-mist/ghost-mist.component';
import { OverlayComponent } from '../../../../shared/overlay/overlay.component';

type DialogStep = 'intro' | 'password' | 'biometric' | 'confirm' | 'running' | 'done';

@Component({
    selector: 'app-erinyes-protocol-dialog',
    imports: [OverlayComponent, FormsModule, TranslatePipe, LucideFlame, LucideDoorOpen, LucideShieldOff, LucideTrash2, LucideCircleCheckBig, LucideLoaderCircle, GhostMistComponent],
    templateUrl: './erinyes-protocol-dialog.component.html',
    styleUrl: './erinyes-protocol-dialog.component.scss',
})
export class ErinyesProtocolDialogComponent {
    private readonly masterPassword = inject(MasterPasswordService);
    private readonly webAuthn = inject(WebAuthnService);
    protected readonly protocol = inject(ErinyesProtocolService);

    readonly show = input(false);
    readonly closed = output<void>();

    protected readonly step = signal<DialogStep>('intro');
    protected readonly password = signal('');
    protected readonly working = signal(false);
    protected readonly passwordError = signal(false);
    protected readonly biometricError = signal(false);

    constructor() {
        effect(() => {
            if (this.show()) {
                this.step.set('intro');
                this.password.set('');
                this.working.set(false);
                this.passwordError.set(false);
                this.biometricError.set(false);
                this.protocol.reset();
            }
        });
    }

    protected get requiresBothCredentials(): boolean {
        return this.masterPassword.hasPassword() && this.webAuthn.isEnabled();
    }

    protected get showMist(): boolean {
        return this.step() === 'running' || this.step() === 'done';
    }

    activate(): void {
        this.step.set(this.requiresBothCredentials ? 'password' : 'confirm');
    }

    async submitPassword(): Promise<void> {
        const pw = this.password();
        if (!pw || this.working()) return;
        this.working.set(true);
        this.passwordError.set(false);
        try {
            const ok = await this.masterPassword.verifyPassword(pw);
            if (!ok) { this.passwordError.set(true); return; }
            this.step.set('biometric');
            await this.runBiometricCheck();
        } finally {
            this.working.set(false);
        }
    }

    async runBiometricCheck(): Promise<void> {
        this.working.set(true);
        this.biometricError.set(false);
        try {
            const ok = await this.webAuthn.authenticate();
            if (!ok) { this.biometricError.set(true); return; }
            await this.startWipe();
        } catch {
            this.biometricError.set(true);
        } finally {
            this.working.set(false);
        }
    }

    async confirmSimple(): Promise<void> {
        await this.startWipe();
    }

    private async startWipe(): Promise<void> {
        this.step.set('running');
        await this.protocol.execute();
        this.step.set('done');
    }

    cancel(): void {
        if (this.step() === 'running' || this.step() === 'done') return;
        this.closed.emit();
    }

    restart(): void {
        window.location.href = '/';
    }

    protected isStepDone(key: ErinyesStep): boolean {
        const order: ErinyesStep[] = ['leaving', 'vault', 'shredding', 'tartaros', 'done'];
        return order.indexOf(this.protocol.step()) > order.indexOf(key);
    }

    protected isStepActive(key: ErinyesStep): boolean {
        return this.protocol.step() === key;
    }
}
