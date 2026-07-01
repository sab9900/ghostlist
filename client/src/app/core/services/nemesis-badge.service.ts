import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class NemesisBadgeService {
    readonly pendingCount = signal(0);

    set(count: number): void {
        this.pendingCount.set(count);
    }

    clear(): void {
        this.pendingCount.set(0);
    }
}
