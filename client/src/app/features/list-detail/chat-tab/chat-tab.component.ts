import { DatePipe } from '@angular/common';
import { Component, computed, effect, ElementRef, inject, signal, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GhostChatMessage } from '../../../core/models';
import { CryptoService } from '../../../core/services/crypto.service';
import { SeenService } from '../../../core/services/seen.service';
import { UserPreferencesService } from '../../../core/services/user-preferences.service';
import { AppStore } from '../../../store/app.store';

interface DecryptedMessage {
    id: string;
    text: string;
    senderName: string;
    createdAt: string;
}

@Component({
    selector: 'app-chat-tab',
    imports: [FormsModule, DatePipe],
    templateUrl: './chat-tab.component.html',
    styleUrl: './chat-tab.component.scss',
})
export class ChatTabComponent {
    protected readonly store = inject(AppStore);
    private readonly crypto = inject(CryptoService);
    protected readonly prefs = inject(UserPreferencesService);
    private readonly seen = inject(SeenService);

    @ViewChild('messageList') private messageListRef?: ElementRef<HTMLUListElement>;

    protected readonly newMessageText = signal('');
    protected readonly sendingMessage = signal(false);
    protected readonly decryptedMessages = signal<DecryptedMessage[]>([]);

    protected readonly showNameDialog = signal(false);
    protected readonly pendingName = signal('');

    private _fullyOpened = false;

    private _firstDecryptDone = false;

    protected readonly firstUnreadIndex = computed(() => {
        const id = this.store.currentListId();
        if (!id) return -1;
        const ts = this.seen.seenMsg()[id];
        if (!ts) return -1;
        const cutoff = new Date(ts).getTime();
        const idx = this.decryptedMessages().findIndex(
            m => new Date(m.createdAt).getTime() > cutoff,
        );
        return idx > 0 ? idx : -1;
    });

    constructor() {
        if (!this.prefs.senderName()) {
            this.pendingName.set('');
            this.showNameDialog.set(true);
        }

        effect(() => {
            void this.store.messages();
            void this.decryptMessages().then(ok => {
                if (!ok) return;

                if (!this._firstDecryptDone) {

                    this._firstDecryptDone = true;
                    this.scrollToFirstUnreadOrBottom();
                    const id = this.store.currentListId();
                    setTimeout(() => {
                        this._fullyOpened = true;
                        if (id) this.seen.markMessagesSeen(id);
                    }, 1200);
                } else if (this._fullyOpened) {

                    this.scrollToBottom();
                }
            });
        });
    }

    private scrollToBottom(): void {
        requestAnimationFrame(() => {
            const el = this.messageListRef?.nativeElement;
            if (el) el.scrollTop = el.scrollHeight;
        });
    }

    private scrollToFirstUnreadOrBottom(): void {
        requestAnimationFrame(() => {
            const el = this.messageListRef?.nativeElement;
            if (!el) return;
            const divider = el.querySelector<HTMLElement>('.unread-divider');
            if (divider) {
                divider.scrollIntoView({ block: 'start' });
            } else {
                el.scrollTop = el.scrollHeight;
            }
        });
    }

    private async decryptMessages(): Promise<boolean> {
        const key = this.store.currentEncryptionKey();
        if (!key) return false;
        const messages = await Promise.all(
            this.store.messages().map(async (msg: GhostChatMessage) => ({
                id: msg.id,
                text: await this.crypto.decrypt(msg.encryptedMessage, msg.messageInitializationVector, key),
                senderName: await this.crypto.decrypt(msg.encryptedSenderName, msg.senderNameInitializationVector, key),
                createdAt: msg.createdAt,
            })),
        );
        this.decryptedMessages.set(messages);
        return true;
    }

    async sendMessage(): Promise<void> {
        const text = this.newMessageText().trim();
        const sender = this.prefs.senderName() || 'Anonymous';
        if (!text) return;
        (document.activeElement as HTMLElement)?.blur();
        this.sendingMessage.set(true);
        try {
            await this.store.sendMessage(text, sender);
            this.newMessageText.set('');

            const id = this.store.currentListId();
            if (id) this.seen.markMessagesSeen(id);
        } finally {
            this.sendingMessage.set(false);
        }
    }

    async deleteMessage(id: string): Promise<void> {
        await this.store.deleteMessage(id);
    }

    openNameDialog(): void {
        this.pendingName.set(this.prefs.senderName());
        this.showNameDialog.set(true);
    }

    saveSenderName(): void {
        const name = this.pendingName().trim();
        if (!name) return;
        this.prefs.setSenderName(name);
        this.showNameDialog.set(false);
    }

    skipNameDialog(): void {
        this.showNameDialog.set(false);
    }
}
