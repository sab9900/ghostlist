import { Component, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { Theme, ThemeAccent } from '../../../../core/services/theme.service';

@Component({
    selector: 'app-appearance-section',
    imports: [TranslatePipe],
    templateUrl: './appearance-section.component.html',
    styleUrl: './appearance-section.component.scss',
})
export class AppearanceSectionComponent {
    readonly theme = input<Theme>('system');
    readonly accent = input<ThemeAccent>('violet');
    readonly themeOptions = input<{ value: Theme; labelKey: string; descKey: string }[]>([]);
    readonly accentOptions = input<{ value: ThemeAccent; labelKey: string; color: string }[]>([]);

    readonly themeChange = output<Theme>();
    readonly accentChange = output<ThemeAccent>();
}
