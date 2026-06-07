import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { CryptoService } from '../../core/services/crypto.service';
import { AppStore } from '../../store/app.store';

@Component({
    selector: 'app-sync',
    imports: [TranslatePipe],
    templateUrl: './sync.component.html',
    styleUrl: './sync.component.scss',
})
export class SyncComponent implements OnInit {
    private readonly route = inject(ActivatedRoute);
    private readonly router = inject(Router);
    private readonly crypto = inject(CryptoService);
    protected readonly store = inject(AppStore);

    protected readonly state = signal<'confirm' | 'sending' | 'done' | 'error'>('confirm');
    protected readonly errorKey = signal<'invalid' | 'no-lists' | 'failed'>('invalid');
    private sessionId = '';
    private receiverPublicKey = '';

    ngOnInit(): void {
        const id = this.route.snapshot.paramMap.get('id') ?? '';
        const key = this.crypto.fromUrlSafeB64(this.route.snapshot.fragment ?? '');

        if (!id || !key) {
            this.errorKey.set('invalid');
            this.state.set('error');
            return;
        }

        this.sessionId = id;
        this.receiverPublicKey = key;
    }

    async sendLists(): Promise<void> {
        if (this.store.knownLists().length === 0) {
            this.errorKey.set('no-lists');
            this.state.set('error');
            return;
        }

        this.state.set('sending');
        try {
            await this.store.pushSyncBundle(this.sessionId, this.receiverPublicKey);
            this.state.set('done');
        } catch {
            this.errorKey.set('failed');
            this.state.set('error');
        }
    }

    goHome(): void {
        this.router.navigate(['/']);
    }
}
