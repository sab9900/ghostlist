import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ShareHandlerService, ShareTarget } from './share-handler.service';

function makeRouter() {
    return { navigate: vi.fn().mockResolvedValue(true) };
}

async function setup() {
    const router = makeRouter();

    TestBed.configureTestingModule({
        providers: [
            provideZonelessChangeDetection(),
            ShareHandlerService,
            { provide: Router, useValue: router },
        ],
    });

    const svc = TestBed.inject(ShareHandlerService);
    return { svc, router };
}

describe('ShareHandlerService', () => {
    afterEach(() => {
        TestBed.resetTestingModule();
        vi.restoreAllMocks();
    });

    describe('consume', () => {
        it('returns null when no payload is pending', async () => {
            const { svc } = await setup();
            expect(svc.consume()).toBeNull();
        });

        it('returns the payload and clears it', async () => {
            const { svc } = await setup();

            svc.pendingPayload.set({
                target: 'charon',
                files: [],
                text: 'hello',
                url: '',
                title: '',
                confirmed: false,
            });

            const result = svc.consume();
            expect(result?.text).toBe('hello');
            expect(svc.pendingPayload()).toBeNull();
        });

        it('returns null on a second consume call', async () => {
            const { svc } = await setup();
            svc.pendingPayload.set({ target: 'chat', files: [], text: '', url: '', title: '', confirmed: false });
            svc.consume();
            expect(svc.consume()).toBeNull();
        });
    });

    describe('confirm', () => {
        it('sets confirmed=true and updates the target', async () => {
            const { svc } = await setup();
            svc.pendingPayload.set({ target: 'charon', files: [], text: '', url: '', title: '', confirmed: false });

            svc.confirm('chat');

            const payload = svc.pendingPayload();
            expect(payload?.confirmed).toBe(true);
            expect(payload?.target).toBe('chat');
        });

        it('is a no-op when there is no pending payload', async () => {
            const { svc } = await setup();
            expect(() => svc.confirm('chat')).not.toThrow();
            expect(svc.pendingPayload()).toBeNull();
        });
    });

    describe('native window event handler', () => {
        it('sets pendingPayload from a ghostShareReceived event', async () => {
            vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
            const { svc } = await setup();

            await (svc as unknown as { initialize(): Promise<void> }).initialize();

            const event = Object.assign(new Event('ghostShareReceived'), {
                shareTarget: 'chat' as ShareTarget,
                text: 'shared text',
                title: 'My Title',
                url: '',
                files: [],
                confirmed: false,
                listId: '',
            });
            window.dispatchEvent(event);

            const payload = svc.pendingPayload();
            expect(payload?.text).toBe('shared text');
            expect(payload?.target).toBe('chat');
            expect(payload?.confirmed).toBe(false);
        });

        it('navigates to /share when the payload is unconfirmed', async () => {
            vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
            const { svc, router } = await setup();
            await (svc as unknown as { initialize(): Promise<void> }).initialize();

            const event = Object.assign(new Event('ghostShareReceived'), {
                shareTarget: 'charon',
                text: '',
                title: '',
                url: '',
                files: [],
                confirmed: false,
                listId: '',
            });
            window.dispatchEvent(event);

            expect(router.navigate).toHaveBeenCalledWith(['/share']);
        });

        it('navigates directly to the list when the payload is confirmed', async () => {
            vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
            const { svc, router } = await setup();
            await (svc as unknown as { initialize(): Promise<void> }).initialize();

            const event = Object.assign(new Event('ghostShareReceived'), {
                shareTarget: 'chat',
                text: '',
                title: '',
                url: '',
                files: [],
                confirmed: true,
                listId: 'list-abc',
            });
            window.dispatchEvent(event);

            expect(router.navigate).toHaveBeenCalledWith(['/list', 'list-abc', 'chat']);
        });

        it('defaults target to charon when shareTarget is missing', async () => {
            vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
            const { svc } = await setup();
            await (svc as unknown as { initialize(): Promise<void> }).initialize();

            const event = Object.assign(new Event('ghostShareReceived'), {
                text: 'x',
                title: '',
                url: '',
                files: [],
                confirmed: false,
                listId: '',
            });
            window.dispatchEvent(event);

            expect(svc.pendingPayload()?.target).toBe('charon');
        });
    });

    describe('PWA cache drain', () => {
        it('sets pendingPayload from the share cache', async () => {
            const metaKey = '/gl-share-meta';
            const cacheName = 'gl-share-target-v1';

            const meta = {
                title: 'Cached Share',
                text: 'some text',
                url: 'https://example.com',
                files: [],
            };

            const mockCache = {
                match: vi.fn(async (key: string) => {
                    if (key === metaKey) return new Response(JSON.stringify(meta));
                    return null;
                }),
                delete: vi.fn().mockResolvedValue(true),
            };

            const originalCaches = (globalThis as Record<string, unknown>)['caches'];
            (globalThis as Record<string, unknown>)['caches'] = {
                open: vi.fn(async () => mockCache),
            };

            try {
                const { svc } = await setup();
                await (svc as unknown as { initialize(): Promise<void> }).initialize();

                const payload = svc.pendingPayload();
                expect(payload?.text).toBe('some text');
                expect(payload?.title).toBe('Cached Share');
                expect(payload?.confirmed).toBe(false);
                expect(payload?.target).toBe('charon');
            } finally {
                (globalThis as Record<string, unknown>)['caches'] = originalCaches;
            }
        });

        it('does nothing when the cache has no meta entry', async () => {
            const mockCache = {
                match: vi.fn().mockResolvedValue(null),
                delete: vi.fn(),
            };

            const originalCaches = (globalThis as Record<string, unknown>)['caches'];
            (globalThis as Record<string, unknown>)['caches'] = {
                open: vi.fn(async () => mockCache),
            };

            try {
                const { svc } = await setup();
                await (svc as unknown as { initialize(): Promise<void> }).initialize();
                expect(svc.pendingPayload()).toBeNull();
            } finally {
                (globalThis as Record<string, unknown>)['caches'] = originalCaches;
            }
        });
    });
});
