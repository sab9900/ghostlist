import { Component, effect, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
    selector: 'app-name-section',
    imports: [FormsModule, TranslatePipe],
    templateUrl: './name-section.component.html',
    styleUrl: './name-section.component.scss',
})
export class NameSectionComponent {
    readonly currentName = input('');
    readonly save = output<string>();

    protected readonly pendingName = signal('');
    protected readonly nameSaved = signal(false);

    constructor() {
        effect(() => {
            const name = this.currentName();
            if (name && !this.pendingName()) this.pendingName.set(name);
        });
    }

    protected submit(): void {
        const name = this.pendingName().trim();
        if (!name) return;
        this.save.emit(name);
        this.nameSaved.set(true);
        setTimeout(() => this.nameSaved.set(false), 2000);
    }
}
