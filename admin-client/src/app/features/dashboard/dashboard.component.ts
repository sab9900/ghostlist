import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AdminStatsService } from '../../core/services/admin-stats.service';
import { AuthService } from '../../core/services/auth.service';
import { AdminStats } from '../../core/models/admin-stats.model';

type DailyMetric = 'lists' | 'items' | 'messages' | 'members';

@Component({
    selector: 'app-dashboard',
    imports: [],
    templateUrl: './dashboard.component.html',
    styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnInit {
    private readonly statsService = inject(AdminStatsService);
    private readonly auth = inject(AuthService);
    private readonly router = inject(Router);

    protected readonly stats = signal<AdminStats | null>(null);
    protected readonly loading = signal(true);
    protected readonly error = signal<string | null>(null);

    ngOnInit(): void {
        this.statsService.getStats(30).subscribe({
            next: (stats) => {
                this.stats.set(stats);
                this.loading.set(false);
            },
            error: () => {
                this.loading.set(false);
                this.error.set('Could not load stats.');
            },
        });
    }

    /** Height percentage for a daily bar, relative to the max value of that metric over the period. */
    barHeight(day: AdminStats['daily'][number], metric: DailyMetric): number {
        const max = Math.max(1, ...(this.stats()?.daily.map((d) => d[metric]) ?? [1]));
        return (day[metric] / max) * 100;
    }

    formatDate(date: string): string {
        return new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    }

    logout(): void {
        this.auth.logout();
        void this.router.navigateByUrl('/login');
    }
}
