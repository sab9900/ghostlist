import { Component, computed, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { InfoMessageType } from '../../core/models';
import { InfoCenterService } from '../../core/services/info-center.service';
import { LanguageService } from '../../core/services/language.service';
import { resolveLocalizedText } from '../../core/utils/localized-text';

const APK_DOWNLOAD_URL = 'https://ghost-list.com/downloads/ghostlist.apk' as const;

const TYPE_LABEL_KEYS: Readonly<Record<InfoMessageType, string>> = {
    [InfoMessageType.Info]: 'INFO_CENTER.TYPE_INFO',
    [InfoMessageType.ReleaseNotes]: 'INFO_CENTER.TYPE_RELEASE_NOTES',
    [InfoMessageType.Maintenance]: 'INFO_CENTER.TYPE_MAINTENANCE',
};

@Component({
    selector: 'app-info-overlay',
    imports: [TranslatePipe],
    templateUrl: './info-overlay.component.html',
    styleUrl: './info-overlay.component.scss',
})
export class InfoOverlayComponent {
    protected readonly infoCenter = inject(InfoCenterService);
    private readonly languageService = inject(LanguageService);

    protected readonly message = this.infoCenter.unreadMessage;

    protected readonly typeLabelKey = computed(() => {
        const message = this.message();
        return message ? TYPE_LABEL_KEYS[message.type] : '';
    });

    protected readonly title = computed(() => {
        const message = this.message();
        return message ? resolveLocalizedText(message.title, this.languageService.currentLang()) : '';
    });

    protected readonly body = computed(() => {
        const message = this.message();
        return message ? resolveLocalizedText(message.body, this.languageService.currentLang()) : '';
    });

    protected readonly InfoMessageType = InfoMessageType;

    protected readonly apkDownloadUrl = APK_DOWNLOAD_URL;

    dismiss(): void {
        this.infoCenter.dismiss();
    }
}
