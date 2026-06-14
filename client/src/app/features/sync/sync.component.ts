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

    protected readonly state = signal<'confirm' | 'sending' | 'waiting' | 'done' | 'error'>('confirm');
    protected readonly errorKey = signal<'invalid' | 'failed'>('invalid');
    protected readonly importedCount = signal(0);
    private sessionId = '';
    private receiverPublicKey = '';
    private pollTimer: ReturnType<typeof setInterval> | null = null;

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
        this.state.set('sending');
        try {
            await this.store.initSyncSendToReceiver(this.sessionId, this.receiverPublicKey);
            this.state.set('waiting');
            this.startPoll();
        } catch {
            this.errorKey.set('failed');
            this.state.set('error');
        }
    }

    private startPoll(): void {
        this.pollTimer = setInterval(async () => {
            try {
                const count = await this.store.claimSyncReply(this.sessionId);
                if (count === null) return;
                this.stopPoll();
                this.importedCount.set(count);
                this.state.set('done');
            } catch { }
        }, 2000);
    }

    private stopPoll(): void {
        if (this.pollTimer !== null) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }
    }

    goHome(): void {
        this.stopPoll();
        this.router.navigate(['/']);
    }
}
