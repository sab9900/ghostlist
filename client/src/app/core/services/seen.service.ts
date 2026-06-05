import { Injectable, signal } from '@angular/core';

const MSG_KEY = 'gl_seen_msg';
const ITEM_KEY = 'gl_seen_item';

@Injectable({ providedIn: 'root' })
export class SeenService {

    private readonly _msg = signal<Record<string, string>>(
        this.load(MSG_KEY),
    );
    private readonly _item = signal<Record<string, string>>(
        this.load(ITEM_KEY),
    );

    readonly seenMsg = this._msg.asReadonly();
    readonly seenItem = this._item.asReadonly();

    markMessagesSeen(listId: string): void {
        const next = { ...this._msg(), [listId]: new Date().toISOString() };
        this._msg.set(next);
        localStorage.setItem(MSG_KEY, JSON.stringify(next));
    }

    markItemsSeen(listId: string): void {
        const next = { ...this._item(), [listId]: new Date().toISOString() };
        this._item.set(next);
        localStorage.setItem(ITEM_KEY, JSON.stringify(next));
    }

    private load(key: string): Record<string, string> {
        try {
            return JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, string>;
        } catch {
            return {};
        }
    }
}
