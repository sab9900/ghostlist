import { Component, output } from '@angular/core';

export const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '😡'];

@Component({
    selector: 'app-reaction-picker',
    imports: [],
    templateUrl: './reaction-picker.component.html',
    styleUrl: './reaction-picker.component.scss',
})
export class ReactionPickerComponent {
    readonly pick = output<string>();

    protected readonly emojis = REACTION_EMOJIS;

    protected onPick(emoji: string, event: MouseEvent | TouchEvent): void {
        event.stopPropagation();
        this.pick.emit(emoji);
    }
}
