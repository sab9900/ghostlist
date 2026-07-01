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

    messageSent(): void {
        if (!this.enabled) return;
        Haptics.impact({ style: ImpactStyle.Medium }).catch(() => { });
        setTimeout(() => Haptics.impact({ style: ImpactStyle.Light }).catch(() => { }), 60);
    }

    whisperSent(): void {
        if (!this.enabled) return;
        Haptics.impact({ style: ImpactStyle.Light }).catch(() => { });
        setTimeout(() => Haptics.impact({ style: ImpactStyle.Light }).catch(() => { }), 90);
    }

    charonDropSent(): void {
        if (!this.enabled) return;
        Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => { });
        setTimeout(() => Haptics.impact({ style: ImpactStyle.Medium }).catch(() => { }), 80);
        setTimeout(() => Haptics.impact({ style: ImpactStyle.Light }).catch(() => { }), 160);
    }

    letheViewerJoined(): void {
        if (!this.enabled) return;
        Haptics.impact({ style: ImpactStyle.Light }).catch(() => { });
        setTimeout(() => Haptics.impact({ style: ImpactStyle.Light }).catch(() => { }), 60);
    }

    letheViewerLeft(): void {
        if (!this.enabled) return;
        Haptics.impact({ style: ImpactStyle.Medium }).catch(() => { });
    }

    reminderFired(): void {
        if (!this.enabled) return;
        Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => { });
        setTimeout(() => Haptics.impact({ style: ImpactStyle.Medium }).catch(() => { }), 100);
        setTimeout(() => Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => { }), 220);
    }

    whisperInviteReceived(): void {
        if (!this.enabled) return;
        Haptics.impact({ style: ImpactStyle.Light }).catch(() => { });
        setTimeout(() => Haptics.impact({ style: ImpactStyle.Light }).catch(() => { }), 90);
    }

    reactionPickerOpened(): void {
        if (!this.enabled) return;
        Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => { });
        setTimeout(() => Haptics.impact({ style: ImpactStyle.Light }).catch(() => { }), 70);
    }

    scrollToBottom(): void {
        if (!this.enabled) return;
        Haptics.impact({ style: ImpactStyle.Light }).catch(() => { });
    }

    swipeBackThresholdCross(): void {
        if (!this.enabled) return;
        Haptics.impact({ style: ImpactStyle.Light }).catch(() => { });
    }

    hapticFeedbackOnTabChange(): void {
        if (!this.enabled) return;
        Haptics.impact({ style: ImpactStyle.Light }).catch(() => { });
    }
}
