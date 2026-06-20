import { DatePipe } from '@angular/common';
import { Component, input, output } from '@angular/core';
import { LucideCheck, LucideCheckCheck, LucideCopy, LucideCornerUpLeft, LucideEllipsisVertical, LucideImage, LucideMic, LucideTrash2 } from '@lucide/angular';
import { TranslatePipe } from '@ngx-translate/core';
import { ViewportDwellDirective } from '../../../../../core/directives/viewport-dwell.directive';
import { AudioWaveformPlayerComponent } from '../../../../../shared/audio-waveform-player/audio-waveform-player.component';
import { AvatarComponent } from '../../../../../shared/avatar/avatar.component';
import { DecryptedMessage, ReplyPreview } from '../../chat-tab.types';

@Component({
    selector: 'app-chat-message',
    imports: [
        DatePipe,
        TranslatePipe,
        ViewportDwellDirective,
        AvatarComponent,
        AudioWaveformPlayerComponent,
        LucideCornerUpLeft,
        LucideImage,
        LucideMic,
        LucideCheckCheck,
        LucideCheck,
        LucideEllipsisVertical,
        LucideCopy,
        LucideTrash2,
    ],
    templateUrl: './chat-message.component.html',
    styleUrl: './chat-message.component.scss',
})
export class ChatMessageComponent {
    readonly msg = input.required<DecryptedMessage>();
    readonly mine = input(false);
    readonly isUnread = input(false);
    readonly isHighlighted = input(false);
    readonly isMenuOpen = input(false);
    readonly menuBelow = input(false);
    readonly menuLeft = input(false);
    readonly replyPreview = input<ReplyPreview | null>(null);
    readonly imageUrl = input<string | null>(null);
    readonly audioUrl = input<string | null>(null);
    readonly readReceiptState = input<'sent' | 'partial' | 'all'>('sent');
    readonly showReadReceipt = input(true);
    readonly readers = input<{ displayName: string }[]>([]);
    readonly swipeOffset = input(0);
    readonly swipeTriggerDistance = input(56);

    readonly menuToggle = output<MouseEvent>();
    readonly reply = output<void>();
    readonly copy = output<void>();
    readonly delete = output<void>();
    readonly scrollToReply = output<string>();
    readonly dwellRead = output<string>();
    readonly touchStart = output<TouchEvent>();
    readonly touchMove = output<TouchEvent>();
    readonly touchEnd = output<void>();
    readonly imageOpen = output<{ url: string; alt: string }>();

    protected parseText(text: string): { value: string; isMention: boolean }[] {
        const segments: { value: string; isMention: boolean }[] = [];
        const regex = /@(\w+)/g;
        let last = 0;
        let match: RegExpExecArray | null;
        while ((match = regex.exec(text)) !== null) {
            if (match.index > last) segments.push({ value: text.slice(last, match.index), isMention: false });
            segments.push({ value: match[0], isMention: true });
            last = match.index + match[0].length;
        }
        if (last < text.length) segments.push({ value: text.slice(last), isMention: false });
        return segments;
    }
}
