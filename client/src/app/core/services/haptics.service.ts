import { inject, Injectable } from '@angular/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { UserPreferencesService } from './user-preferences.service';

@Injectable({ providedIn: 'root' })
export class HapticsService {

    private readonly prefs = inject(UserPreferencesService);

    private get enabled(): boolean {
        return this.prefs.hapticsEnabled();
    }

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
