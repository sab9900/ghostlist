import { inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../api/api.service';
import { DeviceTokenService } from './device-token.service';

@Injectable({ providedIn: 'root' })
export class PushNotificationService {
    private readonly enabled = Capacitor.getPlatform() === 'ios';
    private readonly tokenService = inject(DeviceTokenService);
    private readonly api = inject(ApiService);
    private readonly router = inject(Router);

    /**
     * Call once after known lists are loaded.
     * Requests permission, gets FCM token, registers for all known lists,
     * and wires up notification-tap → navigation.
     */
    async initialize(listIds: string[]): Promise<void> {
        if (!this.enabled) return;

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

        // Suppress foreground notifications — SignalR already handles real-time updates
        PushNotifications.addListener('pushNotificationReceived', (_notification) => {
            // intentionally empty: don't show banner while app is open
        });

        // Navigate to the relevant list when user taps a notification
        PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
            const listId = action.notification.data?.listId as string | undefined;
            if (listId) {
                this.router.navigate(['/list', listId]);
            }
        });
    }

    async subscribeToList(listId: string): Promise<void> {
        const token = this.tokenService.token();
        if (!this.enabled || !token) return;
        await firstValueFrom(this.api.subscribeToList(listId)).catch(() => {});
    }

    async unsubscribeFromList(listId: string): Promise<void> {
        const token = this.tokenService.token();
        if (!this.enabled || !token) return;
        await firstValueFrom(this.api.unsubscribeFromList(listId)).catch(() => {});
    }
}
