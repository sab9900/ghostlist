import { Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
    selector: 'app-haptics-section',
    imports: [FormsModule, TranslatePipe],
    templateUrl: './haptics-section.component.html',
    styleUrl: './haptics-section.component.scss',
})
export class HapticsSectionComponent {
    readonly enabled = input(false);
    readonly toggle = output<boolean>();
}
