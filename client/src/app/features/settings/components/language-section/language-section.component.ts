import { Component, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
    selector: 'app-language-section',
    imports: [TranslatePipe],
    templateUrl: './language-section.component.html',
    styleUrl: './language-section.component.scss',
})
export class LanguageSectionComponent {
    readonly currentLang = input('');
    readonly langs = input<{ code: string; label: string }[]>([]);
    readonly change = output<string>();
}
