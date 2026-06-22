import { Component, ElementRef, computed, input, output, viewChild } from '@angular/core';

interface DragState {
    which: 'start' | 'end';
    pointerId: number;
    startX: number;
    originTime: number;
    trackWidth: number;
}

@Component({
    selector: 'app-video-trim-strip',
    imports: [],
    templateUrl: './video-trim-strip.component.html',
    styleUrl: './video-trim-strip.component.scss',
})
export class VideoTrimStripComponent {
    readonly duration = input(0);
    readonly trimStart = input(0);
    readonly trimEnd = input(0);
    readonly thumbnails = input<string[]>([]);
    readonly playhead = input(0);
    readonly minGap = input(0.2);
    readonly startAriaLabel = input('Trim start');
    readonly endAriaLabel = input('Trim end');

    readonly trimStartChange = output<number>();
    readonly trimEndChange = output<number>();
    readonly dragStart = output<void>();

    private readonly track = viewChild<ElementRef<HTMLDivElement>>('track');

    protected readonly leftPercent = computed(() => this.toPercent(this.trimStart()));
    protected readonly rightPercent = computed(() => this.toPercent(this.trimEnd()));
    protected readonly framePercentWidth = computed(() => Math.max(0, this.rightPercent() - this.leftPercent()));
    protected readonly playheadPercent = computed(() => this.toPercent(this.playhead()));
    protected readonly showPlayhead = computed(() => this.duration() > 0 && this.playhead() > 0.05 && this.playhead() < this.duration() - 0.05);

    private dragState: DragState | null = null;

    protected onHandlePointerDown(event: PointerEvent, which: 'start' | 'end'): void {
        const trackEl = this.track()?.nativeElement;
        if (!trackEl) return;
        event.preventDefault();
        (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
        this.dragState = {
            which,
            pointerId: event.pointerId,
            startX: event.clientX,
            originTime: which === 'start' ? this.trimStart() : this.trimEnd(),
            trackWidth: trackEl.getBoundingClientRect().width || 1,
        };
        this.dragStart.emit();
    }

    protected onHandlePointerMove(event: PointerEvent): void {
        const state = this.dragState;
        if (!state || event.pointerId !== state.pointerId) return;
        const deltaPx = event.clientX - state.startX;
        const deltaTime = (deltaPx / state.trackWidth) * this.duration();
        this.applyTime(state.which, state.originTime + deltaTime);
    }

    protected onHandlePointerUp(event: PointerEvent): void {
        if (this.dragState?.pointerId === event.pointerId) this.dragState = null;
    }

    protected onHandleKeydown(event: KeyboardEvent, which: 'start' | 'end'): void {
        const step = event.shiftKey ? 1 : 0.1;
        let delta = 0;
        if (event.key === 'ArrowLeft') delta = -step;
        else if (event.key === 'ArrowRight') delta = step;
        else return;
        event.preventDefault();
        const origin = which === 'start' ? this.trimStart() : this.trimEnd();
        this.applyTime(which, origin + delta);
    }

    private applyTime(which: 'start' | 'end', rawTime: number): void {
        const duration = this.duration();
        const gap = this.minGap();
        if (which === 'start') {
            const clamped = Math.min(Math.max(0, rawTime), this.trimEnd() - gap);
            this.trimStartChange.emit(Math.max(0, clamped));
        } else {
            const clamped = Math.max(Math.min(duration, rawTime), this.trimStart() + gap);
            this.trimEndChange.emit(Math.min(duration, clamped));
        }
    }

    private toPercent(time: number): number {
        const duration = this.duration();
        if (duration <= 0) return 0;
        return Math.min(100, Math.max(0, (time / duration) * 100));
    }
}
