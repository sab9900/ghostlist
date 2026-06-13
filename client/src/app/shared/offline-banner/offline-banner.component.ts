import { Component, computed, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { AppStore } from '../../store/app.store';

@Component({
    selector: 'app-offline-banner',
    imports: [TranslatePipe],
    templateUrl: './offline-banner.component.html',
    styleUrl: './offline-banner.component.scss',
})
export class OfflineBannerComponent {
    private readonly store = inject(AppStore);

    protected readonly online = this.store.online;
    protected readonly pendingOpsCount = this.store.pendingOpsCount;

    protected readonly visible = computed(() => !this.online() || this.pendingOpsCount() > 0);
}
