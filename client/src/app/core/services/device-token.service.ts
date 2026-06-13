import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class DeviceTokenService {
    readonly token = signal<string | null>(null);
}
