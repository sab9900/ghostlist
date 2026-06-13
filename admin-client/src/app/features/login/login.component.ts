import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AdminStatsService } from '../../core/services/admin-stats.service';
import { AuthService } from '../../core/services/auth.service';
import { APP_VERSION } from '../../version';

@Component({
    selector: 'app-login',
    imports: [FormsModule],
    templateUrl: './login.component.html',
    styleUrl: './login.component.scss',
})
export class LoginComponent {
    private readonly auth = inject(AuthService);
    private readonly stats = inject(AdminStatsService);
    private readonly router = inject(Router);

    readonly version = APP_VERSION;

    readonly username = signal('');
    readonly password = signal('');
    readonly loading = signal(false);
    readonly error = signal<string | null>(null);

    submit(): void {
        if (!this.username() || !this.password()) return;

        this.loading.set(true);
        this.error.set(null);
        this.auth.setCredentials(this.username(), this.password());

        // Verify the credentials by calling a protected endpoint.
        this.stats.getStats(1).subscribe({
            next: () => {
                this.loading.set(false);
                void this.router.navigateByUrl('/');
            },
            error: () => {
                this.loading.set(false);
                this.auth.logout();
                this.error.set('Invalid username or password.');
            },
        });
    }
}
