import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { AppStore } from '../../store/app.store';

@Component({
    selector: 'app-sync-receive',
    imports: [TranslatePipe],
    templateUrl: './sync-receive.component.html',
    styleUrl: './sync-receive.component.scss',
})
export class SyncReceiveComponent implements OnInit {
    private readonly route = inject(ActivatedRoute);
    private readonly router = inject(Router);
    protected readonly store = inject(AppStore);

    protected readonly state = signal<'handshake' | 'waiting' | 'done' | 'error'>('handshake');
    protected readonly importedCount = signal(0);
    private sessionId = '';
    private pollTimer: ReturnType<typeof setInterval> | null = null;

    ngOnInit(): void {
        const id = this.route.snapshot.paramMap.get('id') ?? '';
        if (!id) {
            this.state.set('error');
            return;
        }
        this.sessionId = id;
        void this.startHandshake();
    }

    private async startHandshake(): Promise<void> {
        try {
            await this.store.respondToSyncSend(this.sessionId);
            this.state.set('waiting');
            this.startPoll();
        } catch {
            this.state.set('error');
        }
    }

    private startPoll(): void {
        this.pollTimer = setInterval(async () => {
            try {
                const count = await this.store.claimSyncBundle(this.sessionId);
                this.stopPoll();
                this.importedCount.set(count);
                this.state.set('done');
            } catch { /* 404 = bundle not yet ready */ }
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
