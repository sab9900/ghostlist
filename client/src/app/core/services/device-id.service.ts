import { inject, Injectable } from '@angular/core';
import { PrefsCacheService } from './prefs-cache.service';

const DEVICE_ID_KEY = 'gl_device_id';

/**
 * `gl_device_id` deliberately stays canonically in localStorage rather than
 * moving to IndexedDB. ApiService reads `deviceId` synchronously on every
 * outgoing HTTP request, including requests made from other app
 * initializers (e.g. ShareHandlerService → AppStore) that run concurrently
 * with PrefsCacheService's IndexedDB warm-up — there's no reliable way to
 * guarantee the cache is already warm at that point. Since this is an
 * opaque, non-sensitive device identifier rather than key material, the
 * value is still mirrored into IndexedDB best-effort (fire-and-forget) so it
 * shows up alongside the rest of the app's preferences.
 */
@Injectable({ providedIn: 'root' })
export class DeviceIdService {
    private readonly prefsCache = inject(PrefsCacheService);

    readonly deviceId: string = this.loadOrCreate();

    private loadOrCreate(): string {
        try {
            const stored = localStorage.getItem(DEVICE_ID_KEY);
            if (stored) {
                this.prefsCache.set(DEVICE_ID_KEY, stored);
                return stored;
            }
            const id = self.crypto.randomUUID();
            localStorage.setItem(DEVICE_ID_KEY, id);
            this.prefsCache.set(DEVICE_ID_KEY, id);
            return id;
        } catch {
            return self.crypto.randomUUID();
        }
    }
}
