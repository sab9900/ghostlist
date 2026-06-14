import { Component, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AdminStatsService } from '../../core/services/admin-stats.service';
import { AuthService } from '../../core/services/auth.service';
import { AdminCountryStat, AdminStats } from '../../core/models/admin-stats.model';
import { APP_VERSION } from '../../version';
import { COUNTRY_COORDS, COUNTRY_NAMES, LANGUAGE_NAMES, countryFlag, projectToMap } from '../../core/data/world-map.data';

type DailyMetric = 'lists' | 'items' | 'messages' | 'members';

/** A country marker positioned on the locale map's 1000x500 equirectangular grid. */
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

/** Vertical/horizontal graticule lines for the locale map background, in viewBox units. */
const MAP_GRID_LINES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((i) => (i / 12) * 1000);
const MAP_GRID_ROWS = [0, 1, 2, 3, 4, 5, 6].map((i) => (i / 6) * 500);

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

    /** Height percentage for a daily bar, relative to the max value of that metric over the period. */
    barHeight(day: AdminStats['daily'][number], metric: DailyMetric): number {
        const max = Math.max(1, ...(this.stats()?.daily.map((d) => d[metric]) ?? [1]));
        return (day[metric] / max) * 100;
    }

    formatDate(date: string): string {
        return new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    }

    /** Format a 0..1 ratio as a percentage string, e.g. 0.4321 -> "43%". */
    pct(value: number): string {
        return `${Math.round(value * 100)}%`;
    }

    /** Format a number with one decimal place, e.g. 3.456 -> "3.5". */
    round1(value: number): string {
        return value.toFixed(1);
    }

    /** Display name for a tracked app language code ("en", "de", "it", "es", "other"). */
    languageName(code: string): string {
        return LANGUAGE_NAMES[code] ?? code;
    }

    /** Display name for an ISO 3166-1 alpha-2 country code, falling back to the code itself. */
    countryName(code: string): string {
        return COUNTRY_NAMES[code] ?? code;
    }

    /** Flag emoji for an ISO 3166-1 alpha-2 country code. */
    flag(code: string): string {
        return countryFlag(code);
    }

    /** Up to 10 most-requested countries, for the locale list. */
    topCountries(): AdminCountryStat[] {
        return (this.stats()?.localeBreakdown.countries ?? []).slice(0, 10);
    }

    /** Vertical graticule line positions (x) for the locale map background. */
    mapGridCols(): number[] {
        return MAP_GRID_LINES;
    }

    /** Horizontal graticule line positions (y) for the locale map background. */
    mapGridRows(): number[] {
        return MAP_GRID_ROWS;
    }

    /** Glowing markers for countries with known coordinates, sized by their share of known-country requests. */
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
