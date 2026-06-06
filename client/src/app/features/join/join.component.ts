import { Component, OnInit, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { CryptoService } from '../../core/services/crypto.service';
import { AppStore } from '../../store/app.store';

@Component({
    selector: 'app-join',
    imports: [FormsModule],
    templateUrl: './join.component.html',
    styleUrl: './join.component.scss',
})
export class JoinComponent implements OnInit {
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

    ngOnInit(): void {
        const id = this.route.snapshot.paramMap.get('id') ?? '';

        const key = this.crypto.fromUrlSafeB64(window.location.hash.replace('#', ''));

        if (!id || !key) {
            this.errorMsg.set('Invalid share link — missing list ID or key.');
            this.state.set('error');
            return;
        }

        this.listId.set(id);
        this.encryptionKey.set(key);

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
