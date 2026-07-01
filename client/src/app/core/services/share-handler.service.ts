import { inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Capacitor } from '@capacitor/core';

export type ShareTarget = 'charon' | 'chat' | 'nemesis';

export interface SharedPayload {
    target: ShareTarget;
    files: File[];
    text: string;
    url: string;
    title: string;
    // Only true once the user has explicitly confirmed list + target on the /share picker
    // screen. Tabs must never auto-send a payload that hasn't been confirmed — otherwise a
    // share that arrives while a Charon/Chat tab happens to already be open would get sent
    // there silently, without ever asking which list or which feature the user wants.
    confirmed: boolean;
}

const SHARE_CACHE = 'gl-share-target-v1';
const META_KEY = '/gl-share-meta';

@Injectable({ providedIn: 'root' })
export class ShareHandlerService {
    private readonly router = inject(Router);

    readonly pendingPayload = signal<SharedPayload | null>(null);

    async initialize(): Promise<void> {
        if (Capacitor.isNativePlatform()) {
            this.listenNativeWindowEvent();
        } else {
            await this.drainPwaCache();
        }
    }

    consume(): SharedPayload | null {
        const payload = this.pendingPayload();
        this.pendingPayload.set(null);
        return payload;
    }

    confirm(target: ShareTarget): void {
        const payload = this.pendingPayload();
        if (!payload) return;
        this.pendingPayload.set({ ...payload, target, confirmed: true });
    }

    // Capacitor's triggerWindowJSEvent does NOT dispatch a CustomEvent with `.detail` — its
    // native bridge (native-bridge.js, identical on Android/iOS) copies each property of the
    // data object directly onto the Event instance via `ev[i] = eventData[i]`. So the fields
    // are read straight off the event itself, not off a nested `.detail`. Note "target" is a
    // reserved Event property, which is why the native side sends "shareTarget" instead.
    private listenNativeWindowEvent(): void {
        window.addEventListener('ghostShareReceived', (raw: Event) => {
            const event = raw as unknown as Record<string, unknown>;

            const target = (event['shareTarget'] as ShareTarget) ?? 'charon';
            const text = (event['text'] as string) ?? '';
            const title = (event['title'] as string) ?? '';
            const rawFiles = (event['files'] as { name: string; type: string; data: string }[]) ?? [];
            // Set by the iOS native in-extension picker once the user already chose a list
            // there — lets us skip the /share screen entirely and go straight to sending.
            const confirmed = (event['confirmed'] as boolean) ?? false;
            const listId = (event['listId'] as string) ?? '';

            const files = rawFiles.map((f) => {
                const bytes = this.base64ToBytes(f.data);
                return new File([bytes], f.name, { type: f.type });
            });

            this.pendingPayload.set({ target, files, text, url: '', title, confirmed });

            if (confirmed && listId) {
                void this.router.navigate(['/list', listId, target]);
            } else {
                void this.router.navigate(['/share']);
            }
        });
    }

    private base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
        const raw = atob(b64);
        const bytes = new Uint8Array(new ArrayBuffer(raw.length));
        for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
        return bytes;
    }

    private async drainPwaCache(): Promise<void> {
        if (!('caches' in window)) return;
        try {
            const cache = await caches.open(SHARE_CACHE);
            const metaResponse = await cache.match(META_KEY);
            if (!metaResponse) return;

            const meta = await metaResponse.json() as {
                title: string;
                text: string;
                url: string;
                files: { name: string; type: string; size: number; cacheKey: string }[];
            };

            const files: File[] = (
                await Promise.all(
                    meta.files.map(async (entry) => {
                        const fileResponse = await cache.match(entry.cacheKey);
                        if (!fileResponse) return null;
                        const blob = await fileResponse.blob();
                        return new File([blob], entry.name, { type: entry.type || blob.type });
                    })
                )
            ).filter((f): f is File => f !== null);

            await cache.delete(META_KEY);
            for (const entry of meta.files) await cache.delete(entry.cacheKey);

            this.pendingPayload.set({
                target: 'charon',
                files,
                text: meta.text,
                url: meta.url,
                title: meta.title,
                confirmed: false,
            });
        } catch {
        }
    }
}
