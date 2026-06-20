import { Component, input, output } from '@angular/core';
import { LucideCornerUpLeft } from '@lucide/angular';
import { TranslatePipe } from '@ngx-translate/core';
import { DecryptedMessage } from '../../chat-tab.types';

@Component({
    selector: 'app-reply-bar',
    imports: [TranslatePipe, LucideCornerUpLeft],
    templateUrl: './reply-bar.component.html',
    styleUrl: './reply-bar.component.scss',
})
export class ReplyBarComponent {
    readonly replyingTo = input<DecryptedMessage | null>(null);
    readonly cancel = output<void>();
}
