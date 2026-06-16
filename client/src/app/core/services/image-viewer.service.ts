import { Injectable, signal } from '@angular/core';

export interface ImageViewerEntry {
    src: string;
    alt: string;
}

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
