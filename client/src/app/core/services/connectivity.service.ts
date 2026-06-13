import { Injectable, signal } from '@angular/core';

/**
 * Tracks the browser's online/offline state as a signal.
 *
 * `navigator.onLine` only reflects whether the device has *any* network
 * connection (e.g. Wi-Fi associated), not whether the API/hub are actually
 * reachable — but it's a reasonable, zero-cost signal for "don't even try
 * the network right now" and for triggering a reconnect/sync attempt when
 * connectivity comes back.
 */
@Injectable({ providedIn: 'root' })
export class ConnectivityService {
    readonly online = signal<boolean>(
        typeof navigator === 'undefined' ? true : navigator.onLine,
    );

    constructor() {
        if (typeof window === 'undefined') return;
        window.addEventListener('online', () => this.online.set(true));
        window.addEventListener('offline', () => this.online.set(false));
    }
}
