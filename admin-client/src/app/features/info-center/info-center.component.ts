import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { InfoMessagesService } from '../../core/services/info-messages.service';
import { DevicePlatform, InfoMessage, InfoMessageType } from '../../core/models/info-message.model';
import { buildMultiLangTemplate, isJsonObject, resolveLocalizedText } from '../../core/utils/localized-text';
import { JsonEditorComponent } from '../../shared/json-editor/json-editor.component';

@Component({
    selector: 'app-info-center',
    imports: [FormsModule, RouterLink, JsonEditorComponent],
    templateUrl: './info-center.component.html',
    styleUrl: './info-center.component.scss',
})
export class InfoCenterComponent implements OnInit {
    private readonly infoMessages = inject(InfoMessagesService);

    protected readonly InfoMessageType = InfoMessageType;
    protected readonly DevicePlatform = DevicePlatform;

    protected readonly messages = signal<InfoMessage[]>([]);
    protected readonly loading = signal(true);
    protected readonly error = signal<string | null>(null);

    protected readonly type = signal<InfoMessageType>(InfoMessageType.Info);
    protected readonly title = signal('');
    protected readonly body = signal('');

    protected readonly targetPlatform = signal<DevicePlatform | null>(null);
    protected readonly sending = signal(false);
    protected readonly sendError = signal<string | null>(null);

    protected readonly multiLang = signal(false);

    ngOnInit(): void {
        this.load();
    }

    toggleMultiLang(): void {
        if (this.multiLang()) {

            this.title.set(resolveLocalizedText(this.title()));
            this.body.set(resolveLocalizedText(this.body()));
            this.multiLang.set(false);
            return;
        }

        this.title.set(isJsonObject(this.title()) ? this.title() : buildMultiLangTemplate('de_DE', this.title().trim()));
        this.body.set(isJsonObject(this.body()) ? this.body() : buildMultiLangTemplate('de_DE', this.body().trim()));
        this.multiLang.set(true);
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

        if (this.multiLang() && (!isJsonObject(title) || !isJsonObject(body))) {
            this.sendError.set('Title and Message must be valid JSON objects in multi-language mode.');
            return;
        }

        this.sending.set(true);
        this.sendError.set(null);

        this.infoMessages.create({ type: this.type(), title, body, targetPlatform: this.targetPlatform() }).subscribe({
            next: () => {
                this.sending.set(false);
                this.title.set('');
                this.body.set('');
                this.type.set(InfoMessageType.Info);
                this.targetPlatform.set(null);
                this.multiLang.set(false);
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

    resolveText(value: string): string {
        return resolveLocalizedText(value);
    }
}
