import {
    Component,
    computed,
    effect,
    ElementRef,
    input,
    OnDestroy,
    signal,
    ViewChild,
} from '@angular/core';
import { LucidePause, LucidePlay } from "@lucide/angular";

export type WaveformBar = { height: number };

const BAR_COUNT = 50;
const FALLBACK_BAR_HEIGHT = 0.15;

@Component({
    imports: [LucidePause, LucidePlay],
    selector: 'app-audio-waveform-player',
    templateUrl: './audio-waveform-player.component.html',
    styleUrl: './audio-waveform-player.component.scss',
})
export class AudioWaveformPlayerComponent implements OnDestroy {

    readonly src = input.required<string>();

    @ViewChild('audioEl') private audioElRef?: ElementRef<HTMLAudioElement>;

    protected readonly bars = signal<WaveformBar[]>(
        Array.from({ length: BAR_COUNT }, () => ({ height: FALLBACK_BAR_HEIGHT })),
    );
    protected readonly playing = signal(false);
    protected readonly progress = signal(0); // 0–1
    protected readonly currentTime = signal(0);
    protected readonly duration = signal(0);
    protected readonly decoding = signal(false);
    protected readonly decodeError = signal(false);

    protected readonly playheadBar = computed(() =>
        Math.round(this.progress() * (BAR_COUNT - 1)),
    );

    protected readonly formattedCurrent = computed(() =>
        AudioWaveformPlayerComponent.formatTime(this.currentTime()),
    );
    protected readonly formattedDuration = computed(() =>
        AudioWaveformPlayerComponent.formatTime(this.duration()),
    );

    protected readonly Math = Math;

    private animationFrame: number | null = null;
    private decoded = false;

    constructor() {
        effect(() => {
            const src = this.src();
            if (src) void this.decodeWaveform(src);
        });
    }

    private async decodeWaveform(src: string): Promise<void> {
        this.decoded = false;
        this.decodeError.set(false);
        this.decoding.set(true);

        try {
            const response = await fetch(src);
            const arrayBuffer = await response.arrayBuffer();

            const ctx = new OfflineAudioContext(1, 1, 44100);
            const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

            const channelData = audioBuffer.getChannelData(0);
            const blockSize = Math.floor(channelData.length / BAR_COUNT);
            const bars: WaveformBar[] = [];

            for (let i = 0; i < BAR_COUNT; i++) {
                let sum = 0;
                const start = i * blockSize;
                for (let j = start; j < start + blockSize; j++) {
                    sum += Math.abs(channelData[j]);
                }
                bars.push({ height: sum / blockSize });
            }

            const max = Math.max(...bars.map(b => b.height), 0.0001);
            const MIN_NORMALIZED = 0.08;
            this.bars.set(bars.map(b => ({ height: MIN_NORMALIZED + (b.height / max) * (1 - MIN_NORMALIZED) })));
            this.decoded = true;
        } catch {
            this.decodeError.set(true);
        } finally {
            this.decoding.set(false);
        }
    }

    protected async togglePlayback(): Promise<void> {
        const el = this.audioElRef?.nativeElement;
        if (!el) return;

        if (el.paused) {
            if (el.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) {
                await new Promise<void>(resolve => {
                    const onCanPlay = () => {
                        el.removeEventListener('canplay', onCanPlay);
                        resolve();
                    };
                    el.addEventListener('canplay', onCanPlay);
                });
            }
            try {
                await el.play();
            } catch {
            }
        } else {
            el.pause();
        }
    }

    protected onPlay(): void {
        this.playing.set(true);
        this.scheduleProgressUpdates();
    }

    protected onPause(): void {
        this.playing.set(false);
        this.cancelProgressUpdates();
    }

    protected onEnded(): void {
        this.playing.set(false);
        this.cancelProgressUpdates();
        this.progress.set(1);
    }

    protected onLoadedMetadata(): void {
        const el = this.audioElRef?.nativeElement;
        if (!el) return;
        this.duration.set(isFinite(el.duration) ? el.duration : 0);
    }

    protected onTimeUpdate(): void {
        const el = this.audioElRef?.nativeElement;
        if (!el) return;
        this.currentTime.set(el.currentTime);
        const dur = el.duration;
        this.progress.set(dur > 0 ? el.currentTime / dur : 0);
    }

    protected scrub(event: MouseEvent | TouchEvent): void {
        const el = this.audioElRef?.nativeElement;
        if (!el || !isFinite(el.duration)) return;

        const target = event.currentTarget as HTMLElement;
        const rect = target.getBoundingClientRect();
        const clientX =
            event instanceof MouseEvent
                ? event.clientX
                : event.touches[0]?.clientX ?? 0;

        const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        el.currentTime = ratio * el.duration;
        this.progress.set(ratio);
    }

    private scheduleProgressUpdates(): void {
        const tick = () => {
            const el = this.audioElRef?.nativeElement;
            if (el && !el.paused) {
                this.onTimeUpdate();
                this.animationFrame = requestAnimationFrame(tick);
            }
        };
        this.animationFrame = requestAnimationFrame(tick);
    }

    private cancelProgressUpdates(): void {
        if (this.animationFrame !== null) {
            cancelAnimationFrame(this.animationFrame);
            this.animationFrame = null;
        }
    }

    private static formatTime(seconds: number): string {
        if (!isFinite(seconds) || seconds < 0) return '0:00';
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    }

    ngOnDestroy(): void {
        this.cancelProgressUpdates();
        const el = this.audioElRef?.nativeElement;
        if (el && !el.paused) el.pause();
    }
}
