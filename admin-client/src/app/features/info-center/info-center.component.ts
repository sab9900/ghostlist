import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { InfoMessagesService } from '../../core/services/info-messages.service';
import { InfoMessage, InfoMessageType } from '../../core/models/info-message.model';

@Component({
    selector: 'app-info-center',
    imports: [FormsModule, RouterLink],
    templateUrl: './info-center.component.html',
    styleUrl: './info-center.component.scss',
})
export class InfoCenterComponent implements OnInit {
    private readonly infoMessages = inject(InfoMessagesService);

    protected readonly InfoMessageType = InfoMessageType;

    protected readonly messages = signal<InfoMessage[]>([]);
    protected readonly loading = signal(true);
    protected readonly error = signal<string | null>(null);

    protected readonly type = signal<InfoMessageType>(InfoMessageType.Info);
    protected readonly title = signal('');
    protected readonly body = signal('');
    protected readonly sending = signal(false);
    protected readonly sendError = signal<string | null>(null);

    ngOnInit(): void {
        this.load();
    }

    private load(): void {
        this.loading.set(true);
        this.infoMessages.getAll().subscribe({
            next: (messages) => {
                this.messages.set(messages);
                this.loading.set(false);
            },
            error: () => {
                this.loading.set(false);
                this.error.set('Could not load messages.');
            },
        });
    }

    send(): void {
        const title = this.title().trim();
        const body = this.body().trim();
        if (!title || !body) return;

        this.sending.set(true);
        this.sendError.set(null);

        this.infoMessages.create({ type: this.type(), title, body }).subscribe({
            next: () => {
                this.sending.set(false);
                this.title.set('');
                this.body.set('');
                this.type.set(InfoMessageType.Info);
                this.load();
            },
            error: () => {
                this.sending.set(false);
                this.sendError.set('Could not send message.');
            },
        });
    }

    delete(id: string): void {
        this.messages.update((messages) => messages.filter((m) => m.id !== id));
        this.infoMessages.delete(id).subscribe({
            error: () => this.load(),
        });
    }

    formatDate(date: string): string {
        return new Date(date).toLocaleString();
    }
}
