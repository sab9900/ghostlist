import { Injectable, signal } from '@angular/core';

const USER_ID_KEY = 'gl_user_id';

/**
 * Stable "person" identity, distinct from {@link DeviceIdService}'s per-installation
 * `deviceId`. While `deviceId` identifies this browser/app install (and is used for
 * push subscriptions and kick semantics), `userId` identifies the person across all
 * of their devices. It's adopted from another device during machine sync so the
 * person "remains themselves" — their own items/messages are recognized as "mine"
 * and excluded from unread counts on every device they sync to.
 */
@Injectable({ providedIn: 'root' })
export class UserIdService {
    private readonly _userId = signal<string>(this.loadOrCreate());
    readonly userId = this._userId.asReadonly();

    private loadOrCreate(): string {
        try {
            const stored = localStorage.getItem(USER_ID_KEY);
            if (stored) return stored;
            const id = self.crypto.randomUUID();
            localStorage.setItem(USER_ID_KEY, id);
            return id;
        } catch {
            return self.crypto.randomUUID();
        }
    }

    /**
     * Adopts a userId synced from another of this person's devices, so both
     * devices are recognized as belonging to the same person from then on.
     */
    setUserId(id: string): void {
        this._userId.set(id);
        try {
            localStorage.setItem(USER_ID_KEY, id);
        } catch { }
    }
}
