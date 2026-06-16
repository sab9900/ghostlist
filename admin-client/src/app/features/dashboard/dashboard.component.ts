import { Component, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AdminStatsService } from '../../core/services/admin-stats.service';
import { AuthService } from '../../core/services/auth.service';
import { AdminCountryStat, AdminStats } from '../../core/models/admin-stats.model';
import { APP_VERSION } from '../../version';
import { COUNTRY_COORDS, COUNTRY_NAMES, LANGUAGE_NAMES, WORLD_MAP_PATHS, countryFlag, projectToMap } from '../../core/data/world-map.data';

type DailyMetric = 'lists' | 'items' | 'messages' | 'members';

interface MapMarker {
    country: string;
    flag: string;
    name: string;
    x: number;
    y: number;
    radius: number;
    share: number;
    count: number;
}

const MAP_LAND_PATHS = WORLD_MAP_PATHS;

@Component({
    selector: 'app-dashboard',
    imports: [RouterLink],
    templateUrl: './dashboard.component.html',
    styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnInit {
    private readonly statsService = inject(AdminStatsService);
    private readonly auth = inject(AuthService);
    private readonly router = inject(Router);

    protected readonly version = APP_VERSION;

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

    barHeight(day: AdminStats['daily'][number], metric: DailyMetric): number {
        const max = Math.max(1, ...(this.stats()?.daily.map((d) => d[metric]) ?? [1]));
        return (day[metric] / max) * 100;
    }

    formatDate(date: string): string {
        return new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    }

    pct(value: number): string {
        return `${Math.round(value * 100)}%`;
    }

    round1(value: number): string {
        return value.toFixed(1);
    }

    languageName(code: string): string {
        return LANGUAGE_NAMES[code] ?? code;
    }

    countryName(code: string): string {
        return COUNTRY_NAMES[code] ?? code;
    }

    flag(code: string): string {
        return countryFlag(code);
    }

    topCountries(): AdminCountryStat[] {
        return (this.stats()?.localeBreakdown.countries ?? []).slice(0, 10);
    }

    mapLandPaths(): { name: string; d: string }[] {
        return MAP_LAND_PATHS;
    }

    mapMarkers(): MapMarker[] {
        const countries = this.stats()?.localeBreakdown.countries ?? [];
        const maxShare = Math.max(0.0001, ...countries.map((c) => c.share));

        return countries
            .filter((c) => c.country in COUNTRY_COORDS)
            .map((c) => {
                const [lat, lon] = COUNTRY_COORDS[c.country];
                const { x, y } = projectToMap(lat, lon);
                const radius = 4 + Math.sqrt(c.share / maxShare) * 22;
                return {
                    country: c.country,
                    flag: countryFlag(c.country),
                    name: this.countryName(c.country),
                    x,
                    y,
                    radius,
                    share: c.share,
                    count: c.count,
                };
            });
    }

    logout(): void {
        this.auth.logout();
        void this.router.navigateByUrl('/login');
    }
}
