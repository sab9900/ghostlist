import { inject, Injectable } from '@angular/core';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { HubService } from '../../api/hub.service';

/**
 * Tracks whether the app is currently in the foreground (native: app active,
 * web: tab visible) and reports it to the server via the SignalR hub.
 *
 * The server uses this — together with per-list SignalR room presence — to
 * decide whether to suppress push notifications for a device that's
 * currently being used.
 */
@Injectable({ providedIn: 'root' })
export class ForegroundService {
    private readonly hub = inject(HubService);
    private isForeground = true;
    private started = false;

    start(): void {
        if (this.started) return;
        this.started = true;

        if (Capacitor.isNativePlatform()) {
            this.isForeground = true;
            CapacitorApp.addListener('appStateChange', ({ isActive }) => {
                this.isForeground = isActive;
                this.report();
            });
        } else {
            this.isForeground = !document.hidden;
            document.addEventListener('visibilitychange', () => {
                this.isForeground = !document.hidden;
                this.report();
            });
        }

        this.hub.reconnected$.subscribe(() => this.report());
        this.report();
    }

    private report(): void {
        void this.hub.setAppState(this.isForeground);
    }
}
