import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

@Injectable({ providedIn: 'root' })
export class HapticsService {

    private readonly enabled = Capacitor.getPlatform() === 'ios';

    listTap(): void {
        if (!this.enabled) return;
        Haptics.impact({ style: ImpactStyle.Medium }).catch(() => { });
    }

    itemCheck(): void {
        if (!this.enabled) return;
        Haptics.impact({ style: ImpactStyle.Medium }).catch(() => { });
    }

    messageReceived(): void {
        if (!this.enabled) return;
        Haptics.impact({ style: ImpactStyle.Light }).catch(() => { });
        setTimeout(() => Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => { }), 80);
    }

    itemAdded(): void {
        if (!this.enabled) return;
        Haptics.impact({ style: ImpactStyle.Light }).catch(() => { });
    }
    itemDeleted(): void {
        if (!this.enabled) return;
        Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => { });
    }
}
