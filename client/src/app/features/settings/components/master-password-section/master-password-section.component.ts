import { Component, effect, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideLock } from '@lucide/angular';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
    selector: 'app-master-password-section',
    imports: [FormsModule, TranslatePipe, LucideLock],
    templateUrl: './master-password-section.component.html',
    styleUrl: './master-password-section.component.scss',
})
export class MasterPasswordSectionComponent {
    readonly hasPassword = input(false);
    readonly mode = input<'view' | 'set' | 'change' | 'remove'>('view');
    readonly working = input(false);
    readonly error = input<string | null>(null);
    readonly saved = input(false);

    readonly startSet = output<void>();
    readonly startChange = output<void>();
    readonly startRemove = output<void>();
    readonly cancel = output<void>();
    readonly submitSet = output<string>();
    readonly submitChange = output<{ current: string; next: string }>();
    readonly submitRemove = output<string>();

    protected readonly currentPassword = signal('');
    protected readonly newPassword = signal('');
    protected readonly confirmPassword = signal('');

    constructor() {
        effect(() => {
            this.mode();
            this.currentPassword.set('');
            this.newPassword.set('');
            this.confirmPassword.set('');
        });
    }

    protected onSubmitSet(): void {
        this.submitSet.emit(this.newPassword());
    }

    protected onSubmitChange(): void {
        this.submitChange.emit({ current: this.currentPassword(), next: this.newPassword() });
    }

    protected onSubmitRemove(): void {
        this.submitRemove.emit(this.currentPassword());
    }
}
