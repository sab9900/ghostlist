import { Injectable, signal } from '@angular/core';

/**
 * Tracks whether lists marked as "sensitive" are currently revealed in the
 * UI. This is intentionally in-memory only (not persisted): revealed state
 * resets on app lock/restart, and is toggled via the ghost-logo gesture in
 * the lists view after a successful master-password (and optional
 * biometric) confirmation.
 */
@Injectable({ providedIn: 'root' })
export class SensitiveListsService {
    readonly revealed = signal(false);

    reveal(): void {
        this.revealed.set(true);
    }

    hide(): void {
        this.revealed.set(false);
    }

    toggle(): void {
        this.revealed.set(!this.revealed());
    }
}
