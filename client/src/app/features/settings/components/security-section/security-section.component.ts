import { Component, input, output } from '@angular/core';
import { LucideShield } from '@lucide/angular';
import { TranslatePipe } from '@ngx-translate/core';
import { AutoLockTimeout } from '../../../../core/services/webauthn.service';

@Component({
    selector: 'app-security-section',
    imports: [TranslatePipe, LucideShield],
    templateUrl: './security-section.component.html',
    styleUrl: './security-section.component.scss',
})
export class SecuritySectionComponent {
    readonly isSupported = input(false);
    readonly isEnabled = input(false);
    readonly working = input(false);
    readonly error = input<'unsupported' | 'failed' | null>(null);
    readonly autoLockTimeout = input<AutoLockTimeout>('never');
    readonly autoLockOptions = input<{ value: AutoLockTimeout; labelKey: string }[]>([]);

    readonly enable = output<void>();
    readonly disable = output<void>();
    readonly autoLockChange = output<AutoLockTimeout>();
}
