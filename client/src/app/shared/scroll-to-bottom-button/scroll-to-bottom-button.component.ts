import { Component, input, output } from '@angular/core';
import { LucideChevronDown } from '@lucide/angular';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
    selector: 'app-scroll-to-bottom-button',
    imports: [LucideChevronDown, TranslatePipe],
    templateUrl: './scroll-to-bottom-button.component.html',
    styleUrl: './scroll-to-bottom-button.component.scss',
})
export class ScrollToBottomButtonComponent {
    readonly visible = input(false);

    readonly clicked = output<void>();
}
