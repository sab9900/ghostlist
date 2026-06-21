import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { LucideAlarmClock, LucideFlame, LucideGhost, LucideListChecks, LucideMessageCircle, LucideX } from '@lucide/angular';
import { TranslatePipe } from '@ngx-translate/core';
import { LayoutService } from '../../core/services/layout.service';
import { Snack, SnackService } from '../../core/services/snack.service';

interface SnackEntry {
    snack: Snack;
    closing: boolean;
}

const EXIT_DURATION_MS = 220;

@Component({
    selector: 'app-snack-stack',
    imports: [TranslatePipe, LucideListChecks, LucideMessageCircle, LucideGhost, LucideFlame, LucideAlarmClock, LucideX],
    templateUrl: './snack-stack.component.html',
    styleUrl: './snack-stack.component.scss',
})
export class SnackStackComponent {
    private readonly snackService = inject(SnackService);
    protected readonly layout = inject(LayoutService);

    private readonly entries = signal<SnackEntry[]>([]);

    protected readonly orderedEntries = computed(() => {
        const list = this.entries();
        return this.layout.isDesktop() ? [...list].reverse() : list;
    });

    constructor() {
        effect(() => {
            const live = this.snackService.snacks();
            const liveIds = new Set(live.map(s => s.id));

            untracked(() => {
                const current = this.entries();
                const currentIds = new Set(current.map(e => e.snack.id));

                const updated = current.map(entry => {
                    if (liveIds.has(entry.snack.id)) {
                        return { snack: live.find(s => s.id === entry.snack.id)!, closing: false };
                    }
                    if (!entry.closing) this.scheduleRemoval(entry.snack.id);
                    return entry;
                });

                const additions = live
                    .filter(s => !currentIds.has(s.id))
                    .map(s => ({ snack: s, closing: false }));

                this.entries.set([...updated, ...additions]);
            });
        });
    }

    private scheduleRemoval(id: string): void {
        setTimeout(() => {
            this.entries.update(list => list.filter(e => e.snack.id !== id));
        }, EXIT_DURATION_MS);
    }

    protected onGo(id: string): void {
        this.snackService.runGoAction(id);
    }

    protected onDismiss(id: string): void {
        this.snackService.dismiss(id);
    }
}
