import { inject, Injectable } from '@angular/core';
import { ListStorageService } from './list-storage.service';

interface LegacyKeyMigration {
    legacyKey: string;
    prefKey: string;
    parse: (raw: string) => unknown;
}

// Every preference that used to live in localStorage as a plain string,
// mapped to its IndexedDB pref key and a parser that turns the old string
// value into the properly-typed value IndexedDB stores natively (boolean,
// number, string — no more manual '1'/'0' round-tripping).
const LEGACY_MIGRATIONS: LegacyKeyMigration[] = [
    { legacyKey: 'gl_accent', prefKey: 'gl_accent', parse: (v) => v },
    { legacyKey: 'gl_name_onboarded', prefKey: 'gl_name_onboarded', parse: (v) => v === '1' },
    { legacyKey: 'gl_haptics_enabled', prefKey: 'gl_haptics_enabled', parse: (v) => v === '1' },
    { legacyKey: 'gl_notif_enabled', prefKey: 'gl_notif_enabled', parse: (v) => v === '1' },
    { legacyKey: 'gl_notif_prompted', prefKey: 'gl_notif_prompted', parse: (v) => v === '1' },
    { legacyKey: 'gl_video_camera_facing', prefKey: 'gl_video_camera_facing', parse: (v) => v },
    { legacyKey: 'gl_ghost_mist_enabled', prefKey: 'gl_ghost_mist_mode', parse: (v) => (v === '1' ? 'idle-3s' : 'off') },
    { legacyKey: 'gl_auto_lock_timeout', prefKey: 'gl_auto_lock_timeout', parse: (v) => v },
    { legacyKey: 'gl_pwa_install_dismissed', prefKey: 'gl_pwa_install_dismissed', parse: (v) => v === '1' },
    { legacyKey: 'ghost_fcm_token', prefKey: 'ghost_fcm_token', parse: (v) => v },
    { legacyKey: 'gl_info_last_seen_id', prefKey: 'gl_info_last_seen_id', parse: (v) => v },
    { legacyKey: 'gl_lang', prefKey: 'gl_lang', parse: (v) => v },
    { legacyKey: 'gl_sidebar_width', prefKey: 'gl_sidebar_width', parse: (v) => parseInt(v, 10) },
    { legacyKey: 'gl_pane_width', prefKey: 'gl_pane_width', parse: (v) => parseFloat(v) },
];

/**
 * In-memory cache over ListStorageService's IndexedDB-backed PREFS_STORE.
 *
 * Existing-user migration: the first time the app runs after this cache was
 * introduced, `warmUp()` sweeps the legacy localStorage keys these
 * preferences used to live in, copies any values it finds into IndexedDB,
 * and removes the old localStorage entries. Once that one-time sweep has
 * run, the legacy keys are gone, so it's a no-op on every later launch.
 *
 * `warmUp()` is registered as an app initializer (see app.config.ts), and
 * Angular does not construct the root component — or any routed component —
 * until all app initializers have resolved. So any service/component that
 * is only ever constructed as part of (or after) the component tree can
 * safely call `get()` synchronously at construction time and trust the
 * cache is already warm. Services that may be constructed concurrently with
 * the initializers themselves (e.g. anything reachable from another app
 * initializer) cannot rely on that and should keep their own bootstrap path
 * — see DeviceIdService/UserIdService for the two cases where that applies.
 */
@Injectable({ providedIn: 'root' })
export class PrefsCacheService {
    private readonly storage = inject(ListStorageService);

    private readonly cache = new Map<string, unknown>();
    private warmUpPromise: Promise<void> | null = null;

    warmUp(): Promise<void> {
        this.warmUpPromise ??= this.runWarmUp();
        return this.warmUpPromise;
    }

    /** Alias for warmUp() for callers that just want to await readiness. */
    ready(): Promise<void> {
        return this.warmUp();
    }

    get<T>(key: string, fallback: T): T {
        return this.cache.has(key) ? (this.cache.get(key) as T) : fallback;
    }

    set<T>(key: string, value: T): void {
        this.cache.set(key, value);
        void this.storage.setPref(key, value).catch(() => { });
    }

    delete(key: string): void {
        this.cache.delete(key);
        void this.storage.deletePref(key).catch(() => { });
    }

    private async runWarmUp(): Promise<void> {
        try {
            const all = await this.storage.getAllPrefsRaw();
            for (const { key, value } of all) this.cache.set(key, value);
        } catch { }

        for (const { legacyKey, prefKey, parse } of LEGACY_MIGRATIONS) {
            if (this.cache.has(prefKey)) continue;

            let raw: string | null;
            try {
                raw = localStorage.getItem(legacyKey);
            } catch {
                continue;
            }
            if (raw === null) continue;

            const value = parse(raw);
            this.cache.set(prefKey, value);
            try {
                await this.storage.setPref(prefKey, value);
                localStorage.removeItem(legacyKey);
            } catch { }
        }
    }
}
