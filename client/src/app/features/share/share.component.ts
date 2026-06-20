import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { LucideGhost, LucideSkull, LucideX } from '@lucide/angular';
import { ShareHandlerService, ShareTarget } from '../../core/services/share-handler.service';
import { AppStore } from '../../store/app.store';
import { KnownList } from '../../core/models';

@Component({
    selector: 'app-share',
    imports: [TranslatePipe, LucideX, LucideSkull, LucideGhost],
    templateUrl: './share.component.html',
    styleUrl: './share.component.scss',
})
export class ShareComponent implements OnInit {
    private readonly shareHandler = inject(ShareHandlerService);
    private readonly store = inject(AppStore);
    private readonly router = inject(Router);

    protected readonly knownLists = computed(() => this.store.knownLists());
    protected readonly selectedListId = signal<string | null>(null);
    protected readonly selectedTarget = signal<ShareTarget>('charon');

    protected readonly fileNames = computed(() => {
        const p = this.shareHandler.pendingPayload();
        return p?.files.map((f) => f.name) ?? [];
    });

    protected readonly shareText = computed(() => {
        const p = this.shareHandler.pendingPayload();
        return p?.text || p?.url || p?.title || '';
    });

    ngOnInit(): void {
        const lists = this.knownLists();
        if (lists.length === 1) this.selectedListId.set(lists[0].id);

        const payload = this.shareHandler.pendingPayload();
        if (!payload) {
            void this.router.navigate(['/']);
            return;
        }
        this.selectedTarget.set(payload.target);
    }

    protected selectList(list: KnownList): void {
        this.selectedListId.set(list.id);
    }

    protected selectTarget(target: ShareTarget): void {
        this.selectedTarget.set(target);
    }

    protected async confirm(): Promise<void> {
        const listId = this.selectedListId();
        if (!listId) return;

        const target = this.selectedTarget();
        if (!this.shareHandler.pendingPayload()) return;

        this.shareHandler.confirm(target);

        await this.router.navigate(['/list', listId, target]);
    }

    protected cancel(): void {
        this.shareHandler.consume();
        void this.router.navigate(['/']);
    }
}
