import {
    Component, ElementRef, EventEmitter, OnDestroy, OnInit,
    Output, ViewChild, signal,
} from '@angular/core';
import jsQR from 'jsqr';

@Component({
    selector: 'app-qr-scanner',
    templateUrl: './qr-scanner.component.html',
    styleUrl: './qr-scanner.component.scss',
})
export class QrScannerComponent implements OnInit, OnDestroy {
    @Output() detected = new EventEmitter<string>();
    @ViewChild('video', { static: true }) videoRef!: ElementRef<HTMLVideoElement>;

    protected readonly state = signal<'starting' | 'scanning' | 'error'>('starting');
    protected readonly errorMsg = signal('');

    private stream: MediaStream | null = null;
    private rafId: number | null = null;
    private canvas!: HTMLCanvasElement;
    private ctx!: CanvasRenderingContext2D;

    async ngOnInit(): Promise<void> {
        try {
            await this.startCamera();
        } catch (err) {
            this.setError(err);
        }
    }

    ngOnDestroy(): void {
        this.stop();
    }

    private async startCamera(): Promise<void> {
        if (!navigator.mediaDevices?.getUserMedia) {
            throw new Error('Camera not supported on this device.');
        }

        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;

        this.stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: false,
        });

        const video = this.videoRef.nativeElement;
        video.srcObject = this.stream;
        await video.play();

        this.state.set('scanning');
        this.scheduleFrame();
    }

    private scheduleFrame(): void {
        this.rafId = requestAnimationFrame(() => this.processFrame());
    }

    private processFrame(): void {
        const video = this.videoRef.nativeElement;
        if (video.readyState < 2 || video.videoWidth === 0) {
            this.scheduleFrame();
            return;
        }

        this.canvas.width = video.videoWidth;
        this.canvas.height = video.videoHeight;
        this.ctx.drawImage(video, 0, 0, this.canvas.width, this.canvas.height);

        const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        const result = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: 'attemptBoth',
        });

        if (result?.data) {
            this.stop();
            this.detected.emit(result.data);
            return;
        }

        this.scheduleFrame();
    }

    private stop(): void {
        if (this.rafId !== null) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
        if (this.stream) {
            this.stream.getTracks().forEach((t) => t.stop());
            this.stream = null;
        }
    }

    private setError(err: unknown): void {
        const msg = err instanceof Error ? err.message : 'Camera error.';
        const isDenied = msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('denied') || msg.toLowerCase().includes('notallowed');
        this.errorMsg.set(isDenied ? 'Camera access denied. Please allow camera in settings.' : msg);
        this.state.set('error');
    }
}
