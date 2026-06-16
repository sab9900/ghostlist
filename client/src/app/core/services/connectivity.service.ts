import { Injectable, signal } from '@angular/core';

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
