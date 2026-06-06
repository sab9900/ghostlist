import { Injectable, signal } from '@angular/core';

/**
 * Holds the FCM device token so both ApiService (reads it) and
 * PushNotificationService (sets it) can use it without circular injection.
 */
@Injectable({ providedIn: 'root' })
export class DeviceTokenService {
    readonly token = signal<string | null>(null);
}
