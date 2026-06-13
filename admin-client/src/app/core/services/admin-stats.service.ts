import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AdminStats } from '../models/admin-stats.model';

@Injectable({ providedIn: 'root' })
export class AdminStatsService {
    private readonly http = inject(HttpClient);

    /** @param days How many days of daily history to include (1-365, default 30). */
    getStats(days = 30): Observable<AdminStats> {
        return this.http.get<AdminStats>(`${environment.apiBaseUrl}/admin/stats`, {
            params: { days },
        });
    }
}
