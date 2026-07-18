import { Component, effect, input, output, signal, viewChild, ElementRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { OverlayComponent } from '../../../../shared/overlay/overlay.component';

@Component({
    selector: 'app-create-list-dialog',
    imports: [OverlayComponent, FormsModule, TranslatePipe],
    templateUrl: './create-list-dialog.component.html',
    styleUrl: './create-list-dialog.component.scss',
})
export class CreateListDialogComponent {
    readonly show = input(false);
    readonly creating = input(false);
    readonly error = input<string | null>(null);

    readonly create = output<string>();
    readonly close = output<void>();

    private readonly inputRef = viewChild<ElementRef<HTMLInputElement>>('input');

    protected readonly name = signal('');

    constructor() {
        effect(() => {
            if (this.show()) {
                this.name.set('');
                setTimeout(() => this.inputRef()?.nativeElement.focus(), 0);
            }
        });
    }

    protected submit(): void {
        const trimmed = this.name().trim();
        if (!trimmed || this.creating()) return;
        this.create.emit(trimmed);
    }
}
