import { Component, input, output } from '@angular/core';
import { AvatarComponent } from '../../../../../shared/avatar/avatar.component';

@Component({
    selector: 'app-mention-list',
    imports: [AvatarComponent],
    templateUrl: './mention-list.component.html',
    styleUrl: './mention-list.component.scss',
})
export class MentionListComponent {
    readonly candidates = input<string[]>([]);
    readonly activeIndex = input(0);
    readonly select = output<string>();
}
