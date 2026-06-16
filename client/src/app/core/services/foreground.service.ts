import { inject, Injectable } from '@angular/core';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { HubService } from '../../api/hub.service';

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
