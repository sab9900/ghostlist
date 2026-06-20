import { effect, inject, Injectable } from '@angular/core';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { AppStore } from '../../store/app.store';

interface SharedListEntry {
    id: string;
    name: string;
}

interface SharedListsPlugin {
    sync(options: { lists: SharedListEntry[] }): Promise<void>;
}

const SharedLists = registerPlugin<SharedListsPlugin>('SharedLists');

// Mirrors only {id, name} of each known list (never the encryption key) into the iOS App Group
// container, so the Share Extension — which runs in a fully sandboxed separate process with no
// access to the main app's storage — can show a native "which list?" picker without having to
// bounce the user into the main app first. Android doesn't need this: its share targets reuse
// the exact same WebView/process as the main app, so the Angular /share screen already has
// direct access to the store.
@Injectable({ providedIn: 'root' })
export class SharedListsBridgeService {
    private readonly store = inject(AppStore);

    initialize(): void {
        if (Capacitor.getPlatform() !== 'ios') return;

        effect(() => {
            const lists = this.store.knownLists().map((l) => ({ id: l.id, name: l.name }));
            void SharedLists.sync({ lists }).catch(() => {});
        });
    }
}
