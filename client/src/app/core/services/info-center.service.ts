import { inject, Injectable, signal } from '@angular/core';
import { ApiService } from '../../api/api.service';
import { InfoMessage } from '../models';

const LS_LAST_SEEN_KEY = 'gl_info_last_seen_id';

/**
 * Tracks admin-authored broadcast messages (release notes, maintenance windows, ...).
 * The server only ever exposes the single latest message; "unread" is determined
 * locally by comparing its id against the last one the user dismissed.
 */
@Injectable({ providedIn: 'root' })
export class InfoCenterService {
    private readonly api = inject(ApiService);

    /** The latest admin message, if it hasn't been dismissed yet. Drives the overlay. */
    readonly unreadMessage = signal<InfoMessage | null>(null);

    /** Fetches the latest broadcast message and shows it if it's new. Call once on app startup. */
    checkForUpdates(): void {
        this.api.getLatestInfoMessage().subscribe({
            next: (message) => {
                if (!message || message.id === this.getLastSeenId()) return;
                this.unreadMessage.set(message);
            },
            error: () => { /* offline or no backend reachable — ignore, try again next launch */ },
        });
    }

    /** Marks the currently shown message as read and hides the overlay. */
    dismiss(): void {
        const message = this.unreadMessage();
        if (!message) return;

        try {
            localStorage.setItem(LS_LAST_SEEN_KEY, message.id);
        } catch { }

        this.unreadMessage.set(null);
    }

    private getLastSeenId(): string | null {
        try {
            return localStorage.getItem(LS_LAST_SEEN_KEY);
        } catch {
            return null;
        }
    }
}
