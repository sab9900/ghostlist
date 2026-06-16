import { Injectable, signal } from '@angular/core';

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
