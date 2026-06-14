import { Injectable, signal } from '@angular/core';

export interface ImageViewerEntry {
    src: string;
    alt: string;
}

/**
 * Tiny shared state for the full-screen image lightbox (`ImageViewerComponent`,
 * rendered once at the app root). Any tab can call `open()` with a decrypted
 * data URL to view it large; `close()` (or the viewer's own backdrop/Escape
 * handling) hides it again.
 */
@Injectable({ providedIn: 'root' })
export class ImageViewerService {
    private readonly _current = signal<ImageViewerEntry | null>(null);
    readonly current = this._current.asReadonly();

    open(src: string, alt: string): void {
        this._current.set({ src, alt });
    }

    close(): void {
        this._current.set(null);
    }
}
