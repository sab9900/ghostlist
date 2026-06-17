import { Component, HostListener, inject } from '@angular/core';
import { LucideX } from "@lucide/angular";
import { TranslatePipe } from '@ngx-translate/core';
import { ImageViewerService } from '../../core/services/image-viewer.service';

@Component({
    selector: 'app-image-viewer',
    imports: [TranslatePipe, LucideX],
    templateUrl: './image-viewer.component.html',
    styleUrl: './image-viewer.component.scss',
})
export class ImageViewerComponent {
    private readonly viewer = inject(ImageViewerService);

    protected readonly entry = this.viewer.current;

    close(): void {
        this.viewer.close();
    }

    @HostListener('document:keydown.escape')
    onEscape(): void {
        if (this.entry()) this.close();
    }
}
