import { inject, Injectable, signal } from '@angular/core';
import { ApiService } from '../../api/api.service';
import { InfoMessage } from '../models';
import { APP_VERSION } from '../../version';
import { compareVersions } from '../utils/version-compare';
import { PrefsCacheService } from './prefs-cache.service';

const LAST_SEEN_KEY = 'gl_info_last_seen_id';

@Injectable({ providedIn: 'root' })
export class InfoCenterService {
    private readonly api = inject(ApiService);
    private readonly prefsCache = inject(PrefsCacheService);

    readonly unreadMessage = signal<InfoMessage | null>(null);

    checkForUpdates(): void {
        this.api.getLatestInfoMessage().subscribe({
            next: (message) => {
                if (!message || message.id === this.getLastSeenId()) return;

                if (message.version && compareVersions(APP_VERSION, message.version) >= 0) {
                    this.markSeen(message.id);
                    return;
                }

                this.unreadMessage.set(message);
            },
            error: () => {  },
        });
    }

    dismiss(): void {
        const message = this.unreadMessage();
        if (!message) return;

        this.markSeen(message.id);
        this.unreadMessage.set(null);
    }

    private markSeen(id: string): void {
        this.prefsCache.set(LAST_SEEN_KEY, id);
    }

    private getLastSeenId(): string | null {
        return this.prefsCache.get<string | null>(LAST_SEEN_KEY, null);
    }
}
