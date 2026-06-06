import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

@Injectable({ providedIn: 'root' })
export class HapticsService {

    private readonly enabled = Capacitor.getPlatform() === 'ios';

    /** List card tap */
    listTap(): void {
        if (!this.enabled) return;
        Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => {});
    }

    /** Item checked/unchecked */
    itemCheck(): void {
        if (!this.enabled) return;
        Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {});
    }

    /** New chat message received */
    messageReceived(): void {
        if (!this.enabled) return;
        // Double light tap — subtle but distinct
        Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
        setTimeout(() => Haptics.impact({ style: ImpactStyle.Light }).catch(() => {}), 80);
    }
}
