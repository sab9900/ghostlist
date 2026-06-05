import { Injectable, signal } from '@angular/core';

const SENDER_NAME_KEY = 'gl_sender_name';

@Injectable({ providedIn: 'root' })
export class UserPreferencesService {
    readonly senderName = signal<string>(localStorage.getItem(SENDER_NAME_KEY) ?? '');

    setSenderName(name: string): void {
        const trimmed = name.trim();
        localStorage.setItem(SENDER_NAME_KEY, trimmed);
        this.senderName.set(trimmed);
    }
}
