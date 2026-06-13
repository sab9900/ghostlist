import { Component, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { PwaInstallService } from '../../core/services/pwa-install.service';

@Component({
    selector: 'app-pwa-install-banner',
    imports: [TranslatePipe],
    templateUrl: './pwa-install-banner.component.html',
    styleUrl: './pwa-install-banner.component.scss',
})
export class PwaInstallBannerComponent {
    protected readonly pwaInstall = inject(PwaInstallService);

    install(): void {
        void this.pwaInstall.promptInstall();
    }

    dismiss(): void {
        this.pwaInstall.dismiss();
    }
}
