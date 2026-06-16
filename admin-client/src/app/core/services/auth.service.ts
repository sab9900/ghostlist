import { Injectable, computed, signal } from '@angular/core';

const STORAGE_KEY = 'gl_admin_auth';

@Injectable({ providedIn: 'root' })
export class AuthService {
    private readonly _token = signal<string | null>(sessionStorage.getItem(STORAGE_KEY));

    readonly isAuthenticated = computed(() => this._token() !== null);

    getAuthHeader(): string | null {
        const token = this._token();
        return token ? `Basic ${token}` : null;
    }

    setCredentials(username: string, password: string): void {
        const token = btoa(`${username}:${password}`);
        sessionStorage.setItem(STORAGE_KEY, token);
        this._token.set(token);
    }

    logout(): void {
        sessionStorage.removeItem(STORAGE_KEY);
        this._token.set(null);
    }
}
