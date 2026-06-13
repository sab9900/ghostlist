import { inject, Injectable } from '@angular/core';
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

@Injectable({ providedIn: 'root' })
export class PushNotificationService {
    private readonly platform = Capacitor.getPlatform();
    private readonly tokenService = inject(DeviceTokenService);
    private readonly api = inject(ApiService);
    private readonly router = inject(Router);

    private firebaseApp: FirebaseApp | null = null;
    private messaging: Messaging | null = null;

    async initialize(listIds: string[]): Promise<void> {
        if (this.platform === 'ios') {
            await this.initializeNative(listIds);
        } else if (this.platform === 'web') {
            await this.initializeWeb(listIds);
        }
    }

    private async initializeNative(listIds: string[]): Promise<void> {
        const { receive } = await PushNotifications.requestPermissions();
        if (receive !== 'granted') return;

        await PushNotifications.register();

        PushNotifications.addListener('registration', async ({ value: token }) => {
            this.tokenService.token.set(token);
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
                this.router.navigate(['/list', listId, type === 'message' ? 'chat' : 'items']);
            }
        });
    }

    private async initializeWeb(listIds: string[]): Promise<void> {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
        if (!(await isSupported())) return;

        const { vapidKey, ...firebaseConfig } = environment.firebase;
        if (!vapidKey) {
            console.warn('[Push] No VAPID key configured — web push disabled.');
            return;
        }

        if (Notification.permission === 'default') {
            const permission = await Notification.requestPermission();
            if (permission !== 'granted') return;
        }
        if (Notification.permission !== 'granted') return;

        try {
            // Register under a dedicated scope so this worker doesn't collide
            // with the Angular app-shell service worker (ngsw-worker.js),
            // which is registered at the default '/' scope.
            const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
                scope: '/firebase-cloud-messaging-push-scope',
            });

            this.firebaseApp = initializeApp(firebaseConfig);
            this.messaging = getMessaging(this.firebaseApp);

            const token = await getToken(this.messaging, {
                vapidKey,
                serviceWorkerRegistration: registration,
            });
            if (!token) return;

            this.tokenService.token.set(token);
            for (const id of listIds) {
                await this.subscribeToList(id);
            }

            onMessage(this.messaging, (payload: MessagePayload) => {
                const listId = payload.data?.['listId'];
                const type = payload.data?.['type'];
                if (listId) {
                    this.router.navigate(['/list', listId, type === 'message' ? 'chat' : 'items']);
                }
            });
        } catch (err) {
            console.error('[Push] Web push initialization failed:', err);
        }
    }

    async subscribeToList(listId: string): Promise<void> {
        const token = this.tokenService.token();
        const platform = this.platformDto();
        if (!platform || !token) return;
        await firstValueFrom(this.api.subscribeToList(listId, { deviceToken: token, platform })).catch(() => {});
    }

    /** Re-registers this device for a list with explicit notification preferences (per-list, per-device opt-out). */
    async updatePreferences(listId: string, notifyOnMessage: boolean, notifyOnItemsChanged: boolean): Promise<void> {
        const token = this.tokenService.token();
        const platform = this.platformDto();
        if (!platform || !token) return;
        await firstValueFrom(
            this.api.subscribeToList(listId, { deviceToken: token, platform, notifyOnMessage, notifyOnItemsChanged }),
        ).catch(() => {});
    }

    async unsubscribeFromList(listId: string): Promise<void> {
        const token = this.tokenService.token();
        if (!this.platformDto() || !token) return;
        await firstValueFrom(this.api.unsubscribeFromList(listId)).catch(() => {});
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
