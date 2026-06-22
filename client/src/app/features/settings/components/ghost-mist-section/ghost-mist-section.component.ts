import { Component, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { GhostMistMode } from '../../../../core/services/user-preferences.service';

@Component({
    selector: 'app-ghost-mist-section',
    imports: [TranslatePipe],
    templateUrl: './ghost-mist-section.component.html',
    styleUrl: './ghost-mist-section.component.scss',
})
export class GhostMistSectionComponent {
    readonly mode = input<GhostMistMode>('off');
    readonly modeOptions = input<{ value: GhostMistMode; labelKey: string }[]>([]);

    readonly modeChange = output<GhostMistMode>();
}
