import { Component, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
    selector: 'app-item-add-bar',
    imports: [FormsModule, TranslatePipe],
    templateUrl: './item-add-bar.component.html',
    styleUrl: './item-add-bar.component.scss',
})
export class ItemAddBarComponent {
    readonly adding = input(false);
    readonly add = output<string>();

    protected readonly text = signal('');

    protected submit(): void {
        const val = this.text().trim();
        if (!val || this.adding()) return;
        this.add.emit(val);
        this.text.set('');
    }
}
