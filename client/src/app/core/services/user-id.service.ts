import { Injectable, signal } from '@angular/core';

const USER_ID_KEY = 'gl_user_id';
const USER_ID_CREATED_AT_KEY = 'gl_user_id_created_at';

@Injectable({ providedIn: 'root' })
export class UserIdService {
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
    }
}
