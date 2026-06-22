import { inject, Injectable, signal } from '@angular/core';
import { HubService } from '../../api/hub.service';
import { AppStore } from '../../store/app.store';
import { ListStorageService } from './list-storage.service';
import { VaultKeyService } from './vault-key.service';
import { WebAuthnService } from './webauthn.service';

export type ErinyesStep = 'idle' | 'leaving' | 'vault' | 'shredding' | 'tartaros' | 'done';

const WEBAUTHN_DB_NAME = 'ghostlist';

const MIN_STEP_DURATION_MS = 900;

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
