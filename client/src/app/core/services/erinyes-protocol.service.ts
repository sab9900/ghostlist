import { inject, Injectable, signal } from '@angular/core';
import { HubService } from '../../api/hub.service';
import { AppStore } from '../../store/app.store';
import { ListStorageService } from './list-storage.service';
import { VaultKeyService } from './vault-key.service';
import { WebAuthnService } from './webauthn.service';

export type ErinyesStep = 'idle' | 'leaving' | 'vault' | 'shredding' | 'tartaros' | 'done';

const WEBAUTHN_DB_NAME = 'ghostlist';

// Floor for how long each step stays visible, so the progress animation
// actually reads as a sequence of steps rather than flashing by — the real
// work underneath (a handful of best-effort network calls and local
// deletes) usually finishes in well under this.
const MIN_STEP_DURATION_MS = 900;

/**
 * Orchestrates the "Erinyen-Protokoll": a full, one-way local wipe of this
 * device's relationship to Ghost List. Every known list is left (members
 * simply leave; lists this device owns are forgotten the same way the
 * existing per-list "forget" action already handles ownership — see
 * AppStore.forgetList), the vault/biometric unlock is torn down, and every
 * byte of local storage (both IndexedDB databases and localStorage) is
 * deleted outright rather than emptied field by field.
 *
 * This only ever touches this device. Lists and their content are
 * untouched on the server for every other member.
 *
 * Every sub-step is best-effort: a single failed network call (e.g. this
 * device is offline) must not leave the device half-wiped. Whatever can be
 * deleted locally still gets deleted regardless of network outcome.
 */
@Injectable({ providedIn: 'root' })
export class ErinyesProtocolService {
    private readonly store = inject(AppStore);
    private readonly hub = inject(HubService);
    private readonly storage = inject(ListStorageService);
    private readonly vaultKey = inject(VaultKeyService);
    private readonly webAuthn = inject(WebAuthnService);

    readonly step = signal<ErinyesStep>('idle');

    async execute(): Promise<void> {
        await this.runStep('leaving', () => this.leaveAllLists());
        await this.runStep('vault', () => this.clearVault());
        await this.runStep('shredding', () => this.shredLocalData());
        await this.runStep('tartaros', () => this.castTheRestIntoTartaros());
        this.step.set('done');
    }

    reset(): void {
        this.step.set('idle');
    }

    private async runStep(step: ErinyesStep, work: () => Promise<void>): Promise<void> {
        this.step.set(step);
        const startedAt = Date.now();
        try {
            await work();
        } catch { }
        const remaining = MIN_STEP_DURATION_MS - (Date.now() - startedAt);
        if (remaining > 0) await new Promise(resolve => setTimeout(resolve, remaining));
    }

    private async leaveAllLists(): Promise<void> {
        const ids = this.store.knownLists().map(l => l.id);
        for (const id of ids) {
            try { await this.store.forgetList(id); } catch { }
        }
        try { await this.hub.disconnect(); } catch { }
    }

    private async clearVault(): Promise<void> {
        try {
            if (this.webAuthn.isEnabled()) await this.webAuthn.disable();
        } catch { }
        this.vaultKey.lock();
    }

    private async shredLocalData(): Promise<void> {
        try { await this.storage.deleteDatabase(); } catch { }
        await this.deleteIndexedDbBestEffort(WEBAUTHN_DB_NAME);
    }

    private async castTheRestIntoTartaros(): Promise<void> {
        try { localStorage.clear(); } catch { }
    }

    /**
     * `indexedDB.deleteDatabase` only resolves once every open connection to
     * it is closed. WebAuthnService opens a fresh connection per call and
     * never explicitly closes any of them, so a delete here could in
     * principle hang in "blocked" state. The credentials/wraps it holds are
     * already removed by clearVault()'s webAuthn.disable() above — deleting
     * the (now-empty) database itself is best-effort housekeeping, so a
     * timeout fallback is fine: worst case it's deleted lazily once the
     * lingering connection closes on its own.
     */
    private deleteIndexedDbBestEffort(name: string, timeoutMs = 1500): Promise<void> {
        return new Promise((resolve) => {
            let settled = false;
            const settle = () => { if (!settled) { settled = true; resolve(); } };
            try {
                const req = indexedDB.deleteDatabase(name);
                req.onsuccess = () => settle();
                req.onerror = () => settle();
                req.onblocked = () => settle();
            } catch {
                settle();
            }
            setTimeout(settle, timeoutMs);
        });
    }
}
