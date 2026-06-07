import { Injectable } from '@angular/core';

const DEVICE_ID_KEY = 'gl_device_id';

@Injectable({ providedIn: 'root' })
export class DeviceIdService {
    readonly deviceId: string = this.loadOrCreate();

    private loadOrCreate(): string {
        try {
            const stored = localStorage.getItem(DEVICE_ID_KEY);
            if (stored) return stored;
            const id = self.crypto.randomUUID();
            localStorage.setItem(DEVICE_ID_KEY, id);
            return id;
        } catch {
            return self.crypto.randomUUID();
        }
    }
}
