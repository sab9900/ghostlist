import { inject, Injectable, signal } from '@angular/core';
import { PrefsCacheService } from './prefs-cache.service';

const USER_ID_KEY = 'gl_user_id';
const USER_ID_CREATED_AT_KEY = 'gl_user_id_created_at';

/**
 * `gl_user_id`/`gl_user_id_created_at` deliberately stay canonically in
 * localStorage rather than moving to IndexedDB — see DeviceIdService for
 * why (same reasoning: read synchronously on every outgoing HTTP request,
 * including from app initializers that race PrefsCacheService's warm-up).
 * Mirrored into IndexedDB best-effort for consistency/visibility.
 */
@Injectable({ providedIn: 'root' })
export class UserIdService {
    private readonly prefsCache = inject(PrefsCacheService);
    private readonly _userId = signal<string>('');
    private readonly _createdAt = signal<string>('');
    readonly userId = this._userId.asReadonly();
    readonly createdAt = this._createdAt.asReadonly();

    constructor() {
        const { id, createdAt } = this.loadOrCreate();
        this._userId.set(id);
        this._createdAt.set(createdAt);
    }

    private loadOrCreate(): { id: string; createdAt: string } {
        try {
            let id = localStorage.getItem(USER_ID_KEY);
            let createdAt = localStorage.getItem(USER_ID_CREATED_AT_KEY);

            if (!id) {
                id = self.crypto.randomUUID();
                createdAt = new Date().toISOString();
                localStorage.setItem(USER_ID_KEY, id);
                localStorage.setItem(USER_ID_CREATED_AT_KEY, createdAt);
            } else if (!createdAt) {

                createdAt = new Date(0).toISOString();
                localStorage.setItem(USER_ID_CREATED_AT_KEY, createdAt);
            }

            this.mirrorToIdb(id, createdAt);
            return { id, createdAt };
        } catch {
            return { id: self.crypto.randomUUID(), createdAt: new Date().toISOString() };
        }
    }

    setUserId(id: string, createdAt: string): void {
        this._userId.set(id);
        this._createdAt.set(createdAt);
        try {
            localStorage.setItem(USER_ID_KEY, id);
            localStorage.setItem(USER_ID_CREATED_AT_KEY, createdAt);
        } catch { }
        this.mirrorToIdb(id, createdAt);
    }

    private mirrorToIdb(id: string, createdAt: string): void {
        this.prefsCache.set(USER_ID_KEY, id);
        this.prefsCache.set(USER_ID_CREATED_AT_KEY, createdAt);
    }
}
