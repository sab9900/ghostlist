import { inject, Injectable, signal } from '@angular/core';
import { ApiService } from '../../api/api.service';
import { InfoMessage } from '../models';
import { APP_VERSION } from '../../version';
import { compareVersions } from '../utils/version-compare';

const LS_LAST_SEEN_KEY = 'gl_info_last_seen_id';

@Injectable({ providedIn: 'root' })
export class InfoCenterService {
    private readonly api = inject(ApiService);

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
        try {
            localStorage.setItem(LS_LAST_SEEN_KEY, id);
        } catch { }
    }

    private getLastSeenId(): string | null {
        try {
            return localStorage.getItem(LS_LAST_SEEN_KEY);
        } catch {
            return null;
        }
    }
}
