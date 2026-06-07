import { Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { combineLatest, take } from 'rxjs';
import { CryptoService } from '../../core/services/crypto.service';
import { TranslatePipe } from '@ngx-translate/core';
import { AppStore } from '../../store/app.store';

@Component({
    selector: 'app-join',
    imports: [FormsModule, TranslatePipe],
    templateUrl: './join.component.html',
    styleUrl: './join.component.scss',
})
export class JoinComponent {
    private readonly route = inject(ActivatedRoute);
    private readonly router = inject(Router);
    private readonly crypto = inject(CryptoService);
    protected readonly store = inject(AppStore);

    protected readonly state = signal<'prompt' | 'importing' | 'error'>('prompt');
    protected readonly listId = signal('');
    protected readonly encryptionKey = signal('');
    protected readonly listName = signal('');
    protected readonly errorMsg = signal('');

    constructor() {
        // Use Observables — snapshot.fragment/queryParams are unreliable on initial
        // navigation for lazy-loaded routes.
        combineLatest([this.route.paramMap, this.route.queryParamMap, this.route.fragment])
            .pipe(take(1))
            .subscribe(([params, queryParams, fragment]) => {
                const id = params.get('id') ?? '';
                const key = fragment ? this.crypto.fromUrlSafeB64(fragment) : '';

                if (!id || !key) {
                    this.errorMsg.set('Invalid share link — missing list ID or key.');
                    this.state.set('error');
                    return;
                }

                this.listId.set(id);
                this.encryptionKey.set(key);

                // If the link includes a list name (?n=...), skip the name prompt and
                // import directly — same UX as the QR-code flow.
                const nameFromUrl = queryParams.get('n');
                if (nameFromUrl) {
                    this.listName.set(nameFromUrl);
                    void this.importList();
                }
            });

        // If the list is already known (re-opened share link), skip to it directly.
        effect(() => {
            if (!this.store.listsLoaded()) return;
            const id = this.listId();
            if (!id || this.state() !== 'prompt') return;
            const already = this.store.knownLists().find((l) => l.id === id);
            if (already) {
                this.router.navigate(['/list', id]);
            }
        });
    }

    async importList(): Promise<void> {
        const name = this.listName().trim();
        if (!name) return;

        this.state.set('importing');
        try {
            await this.store.importFromLink(this.listId(), this.encryptionKey(), name);
            await this.router.navigate(['/list', this.listId()]);
        } catch (err) {
            this.errorMsg.set(err instanceof Error ? err.message : 'Import failed.');
            this.state.set('error');
        }
    }

    goHome(): void {
        this.router.navigate(['/']);
    }
}
