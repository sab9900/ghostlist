import { effect, inject, Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { AppStore } from '../../store/app.store';

@Injectable({ providedIn: 'root' })
export class BadgeService {
    private readonly store = inject(AppStore);
    private readonly platform = Capacitor.getPlatform();

    constructor() {
        effect(() => {
            const count = this.store.totalUnread() + this.store.totalUnreadItems();
            void this.applyBadge(count);
        });
    }

    private async applyBadge(count: number): Promise<void> {
        if (this.platform === 'ios' || this.platform === 'android') {
            await this.setNativeBadge(count);
        } else {
            await this.setWebBadge(count);
            this.broadcastToSw(count);
        }
    }

    private async setNativeBadge(count: number): Promise<void> {
        try {

            const { Badge } = await import('@capawesome/capacitor-badge');

            const { isSupported } = await Badge.isSupported();
            if (!isSupported) return;

            const { display } = await Badge.checkPermissions();
            if (display !== 'granted') {
                const { display: granted } = await Badge.requestPermissions();
                if (granted !== 'granted') return;
            }

            await Badge.set({ count });
        } catch {

        }
    }

    private async setWebBadge(count: number): Promise<void> {
        if (!('setAppBadge' in navigator)) return;
        try {
            if (count > 0) {
                await (navigator as Navigator & { setAppBadge(n: number): Promise<void> }).setAppBadge(count);
            } else {
                await (navigator as Navigator & { clearAppBadge(): Promise<void> }).clearAppBadge();
            }
        } catch {

        }
    }

    private broadcastToSw(count: number): void {
        if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) return;
        navigator.serviceWorker.controller.postMessage({ type: 'BADGE_COUNT_SYNC', count });
    }
}
