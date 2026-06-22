import { inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { FirebaseApp, initializeApp } from 'firebase/app';
import { getMessaging, getToken, isSupported, Messaging, MessagePayload, onMessage } from 'firebase/messaging';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiService } from '../../api/api.service';
import { DevicePlatformDto } from '../models';
import { DeviceTokenService } from './device-token.service';
import { LanguageService } from './language.service';
import { PrefsCacheService } from './prefs-cache.service';

@Injectable({ providedIn: 'root' })
export class PushNotificationService {
    private readonly platform = Capacitor.getPlatform();
    private readonly tokenService = inject(DeviceTokenService);
    private readonly api = inject(ApiService);
    private readonly router = inject(Router);
    private readonly languageService = inject(LanguageService);
    private readonly prefsCache = inject(PrefsCacheService);

    private firebaseApp: FirebaseApp | null = null;
    private messaging: Messaging | null = null;
    /** List IDs from the most recent initialize() call – used when enablePush is called later (e.g. from onboarding dialog). */
    lastKnownListIds: string[] = [];

    private tokenReady: Promise<void>;
    private resolveTokenReady!: () => void;

    /**
     * Current permission state.
     * On web: reflects Notification.permission and is updated after each request.
     * On native: starts as 'default' (unknown) and is updated after checkPermissions/requestPermissions.
     */
    readonly webPushPermission = signal<NotificationPermission>(
        typeof Notification !== 'undefined' ? Notification.permission : 'default',
    );

    /** True once FCM/native push is fully active (token obtained and subscriptions registered). */
    readonly pushActive = signal(false);

    constructor() {
        this.tokenReady = new Promise<void>((resolve) => {
            this.resolveTokenReady = resolve;
        });
    }

    private setToken(token: string): void {
        this.tokenService.token.set(token);
        this.resolveTokenReady();
    }

    private async waitForToken(timeoutMs = 8000): Promise<string | null> {
        const existing = this.tokenService.token();
        if (existing) return existing;

        await Promise.race([
            this.tokenReady,
            new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
        ]);

        return this.tokenService.token();
    }

    async initialize(listIds: string[]): Promise<void> {
        this.lastKnownListIds = listIds;
        if (this.platform === 'ios' || this.platform === 'android') {
            await this.initializeNative(listIds);
        } else if (this.platform === 'web') {
            await this.initializeWeb(listIds);
        }
    }

    /**
     * Unified entry point called from the onboarding dialog button (all platforms).
     * Must be triggered by a direct user gesture.
     */
    async enablePush(listIds: string[]): Promise<void> {
        this.lastKnownListIds = listIds;
        if (this.platform === 'ios' || this.platform === 'android') {
            await this.enableNativePush(listIds);
        } else if (this.platform === 'web') {
            await this.enableWebPush(listIds);
        }
    }

    private async enableNativePush(listIds: string[]): Promise<void> {
        const { receive: current } = await PushNotifications.checkPermissions();
        if (current === 'granted') {
            await this.setupNativePush(listIds);
            return;
        }
        if (current === 'denied') {
            this.webPushPermission.set('denied');
            return;
        }
        const { receive } = await PushNotifications.requestPermissions();
        this.webPushPermission.set(receive === 'granted' ? 'granted' : 'denied');
        if (receive !== 'granted') return;
        await this.setupNativePush(listIds);
    }

    private async initializeNative(listIds: string[]): Promise<void> {
        const { receive } = await PushNotifications.checkPermissions();
        this.webPushPermission.set(receive === 'granted' ? 'granted' : receive === 'denied' ? 'denied' : 'default');
        if (receive !== 'granted') return;
        await this.setupNativePush(listIds);
    }

    private async setupNativePush(listIds: string[]): Promise<void> {
        if (this.platform === 'android') {
            await PushNotifications.createChannel({
                id: 'ghost_messages_v2',
                name: 'Nachrichten',
                description: 'Chat-Nachrichten in deinen Listen',
                importance: 4,
                vibration: true,
                sound: 'sonar_ping',
                visibility: 1,
            });
            await PushNotifications.createChannel({
                id: 'ghost_lethe_v2',
                name: 'Lethe – Flüster-Einladungen',
                description: 'Einladungen in den Lethe-Flüsterkanal',
                importance: 5,
                vibration: true,
                sound: 'sonar_ping',
                visibility: 1,
            });
            await PushNotifications.createChannel({
                id: 'ghost_charon_v2',
                name: 'Charon – Drops',
                description: 'Neue Dateien im Charon Dead-Drop',
                importance: 4,
                vibration: true,
                sound: 'sonar_ping',
                visibility: 1,
            });
            await PushNotifications.createChannel({
                id: 'ghost_items_v2',
                name: 'Listen-Updates',
                description: 'Änderungen an deinen Listen',
                importance: 3,
                vibration: false,
                sound: 'sonar_ping',
                visibility: 1,
            });
            await PushNotifications.createChannel({
                id: 'ghost_reminders_v2',
                name: 'Erinnerungen',
                description: 'Fälligkeitserinnerungen für Items',
                importance: 5,
                vibration: true,
                sound: 'sonar_ping',
                visibility: 1,
            });
        }

        await PushNotifications.removeAllListeners();

        // Listeners MUST be registered before register() is called.
        // On iOS the 'registration' event can fire synchronously from the
        // cached APNs/FCM token during register() — adding listeners afterwards
        // means the token is never received.
        PushNotifications.addListener('registration', async ({ value: token }) => {
            this.setToken(token);
            this.webPushPermission.set('granted');
            this.pushActive.set(true);
            for (const id of listIds) {
                await this.subscribeToList(id);
            }
        });

        PushNotifications.addListener('registrationError', (err) => {
            console.error('[Push] Registration error:', err);
        });

        PushNotifications.addListener('pushNotificationReceived', (_notification) => {
        });

        PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
            const listId = action.notification.data?.listId as string | undefined;
            const type = action.notification.data?.type as string | undefined;
            if (listId) {
                this.router.navigate(['/list', listId, this.routeForType(type)]);
            }
        });

        await PushNotifications.register();
    }

    private readonly WEB_TOKEN_STORAGE_KEY = 'ghost_fcm_token';

    /**
     * Called automatically on app start.
     * Only proceeds if permission is already granted – never prompts.
     * iOS Safari requires requestPermission() to be inside a direct user gesture;
     * use enableWebPush() (triggered by a button tap) for the first-time flow.
     */
    private async initializeWeb(listIds: string[]): Promise<void> {
        if (Notification.permission !== 'granted') return;
        await this.setupWebFcm(listIds);
    }

    /**
     * Must be called from a direct user-gesture handler (button click/tap).
     * Requests permission if not yet granted, then initialises FCM.
     * Returns whether push is now active.
     */
    async enableWebPush(listIds: string[]): Promise<boolean> {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
        if (!(await isSupported())) return false;

        if (Notification.permission === 'default') {
            const result = await Notification.requestPermission();
            this.webPushPermission.set(result);
            if (result !== 'granted') return false;
        } else if (Notification.permission !== 'granted') {
            return false;
        }

        return this.setupWebFcm(listIds);
    }

    private async setupWebFcm(listIds: string[]): Promise<boolean> {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
        if (!(await isSupported())) return false;

        const { vapidKey, ...firebaseConfig } = environment.firebase;
        if (!vapidKey) {
            console.warn('[Push] No VAPID key configured — web push disabled.');
            return false;
        }

        try {
            const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
                scope: '/firebase-cloud-messaging-push-scope',
            });

            this.firebaseApp ??= initializeApp(firebaseConfig);
            this.messaging ??= getMessaging(this.firebaseApp);

            const token = await getToken(this.messaging, {
                vapidKey,
                serviceWorkerRegistration: registration,
            });
            if (!token) return false;

            const previousToken = this.prefsCache.get<string | null>(this.WEB_TOKEN_STORAGE_KEY, null);
            if (previousToken && previousToken !== token) {
                console.info('[Push] FCM token rotated – re-subscribing with new token.');
            }
            this.prefsCache.set(this.WEB_TOKEN_STORAGE_KEY, token);

            this.setToken(token);
            this.pushActive.set(true);
            for (const id of listIds) {
                await this.subscribeToList(id);
            }

            onMessage(this.messaging, (payload: MessagePayload) => {
                const listId = payload.data?.['listId'];
                const type = payload.data?.['type'];
                if (listId) {
                    this.router.navigate(['/list', listId, this.routeForType(type)]);
                }
            });

            return true;
        } catch (err) {
            console.error('[Push] Web push initialization failed:', err);
            return false;
        }
    }

    async subscribeToList(listId: string): Promise<void> {
        const token = await this.waitForToken();
        const platform = this.platformDto();
        if (!platform || !token) return;
        const locale = this.languageService.currentLang();
        await firstValueFrom(this.api.subscribeToList(listId, { deviceToken: token, platform, locale })).catch(() => {});
    }

    async updatePreferences(
        listId: string,
        notifyOnMessage: boolean,
        notifyOnItemsChanged: boolean,
        notifyOnLethe: boolean,
        notifyOnCharon: boolean,
    ): Promise<void> {
        const token = await this.waitForToken();
        const platform = this.platformDto();
        if (!platform || !token) return;
        const locale = this.languageService.currentLang();
        await firstValueFrom(
            this.api.subscribeToList(listId, { deviceToken: token, platform, notifyOnMessage, notifyOnItemsChanged, notifyOnLethe, notifyOnCharon, locale }),
        ).catch(() => {});
    }

    async unsubscribeFromList(listId: string): Promise<void> {
        const token = await this.waitForToken();
        if (!this.platformDto() || !token) return;
        await firstValueFrom(this.api.unsubscribeFromList(listId)).catch(() => {});
    }

    private routeForType(type: string | undefined): string {
        switch (type) {
            case 'message':
                return 'chat';
            case 'whisper_invite':
                return 'whisper';
            case 'charon_drop':
                return 'charon';
            default:
                return 'items';
        }
    }

    private platformDto(): DevicePlatformDto | null {
        switch (this.platform) {
            case 'ios':
                return 'Ios';
            case 'android':
                return 'Android';
            case 'web':
                return 'Web';
            default:
                return null;
        }
    }
}
