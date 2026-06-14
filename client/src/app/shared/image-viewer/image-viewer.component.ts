import { Component, HostListener, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { ImageViewerService } from '../../core/services/image-viewer.service';

/**
 * Full-screen lightbox for viewing shared images (Chat, Charon) at full size.
 * Rendered once at the app root; opened/closed via `ImageViewerService`.
 */
@Component({
    selector: 'app-image-viewer',
    imports: [TranslatePipe],
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
