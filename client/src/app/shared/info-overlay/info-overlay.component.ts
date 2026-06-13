import { Component, computed, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { InfoMessageType } from '../../core/models';
import { InfoCenterService } from '../../core/services/info-center.service';

const TYPE_LABEL_KEYS: Readonly<Record<InfoMessageType, string>> = {
    [InfoMessageType.Info]: 'INFO_CENTER.TYPE_INFO',
    [InfoMessageType.ReleaseNotes]: 'INFO_CENTER.TYPE_RELEASE_NOTES',
    [InfoMessageType.Maintenance]: 'INFO_CENTER.TYPE_MAINTENANCE',
};

/**
 * Full-screen overlay shown once per new admin broadcast message
 * (release notes, maintenance windows, ...). Dismissing it marks the
 * message as read so it won't reappear on the next launch.
 */
@Component({
    selector: 'app-info-overlay',
    imports: [TranslatePipe],
    templateUrl: './info-overlay.component.html',
    styleUrl: './info-overlay.component.scss',
})
export class InfoOverlayComponent {
    protected readonly infoCenter = inject(InfoCenterService);

    protected readonly message = this.infoCenter.unreadMessage;

    protected readonly typeLabelKey = computed(() => {
        const message = this.message();
        return message ? TYPE_LABEL_KEYS[message.type] : '';
    });

    protected readonly InfoMessageType = InfoMessageType;

    dismiss(): void {
        this.infoCenter.dismiss();
    }
}
