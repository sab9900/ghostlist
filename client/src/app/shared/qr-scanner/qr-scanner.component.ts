import {
    Component, ElementRef, EventEmitter, OnDestroy, OnInit,
    Output, ViewChild, signal,
} from '@angular/core';

declare const BarcodeDetector: {
    new(opts: { formats: string[] }): {
        detect(source: ImageBitmap | HTMLVideoElement | HTMLCanvasElement): Promise<Array<{ rawValue: string }>>;
    };
    getSupportedFormats(): Promise<string[]>;
};

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
    private detector: InstanceType<typeof BarcodeDetector> | null = null;
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

        const hasBarcodeDetector = typeof BarcodeDetector !== 'undefined';
        if (!hasBarcodeDetector) {
            throw new Error('QR scanning is not supported in this browser. Try Chrome 83+ or Safari 17.4+.');
        }

        const formats = await BarcodeDetector.getSupportedFormats();
        if (!formats.includes('qr_code')) {
            throw new Error('QR code format not supported by this device.');
        }

        this.detector = new BarcodeDetector({ formats: ['qr_code'] });

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

    private async processFrame(): Promise<void> {
        const video = this.videoRef.nativeElement;
        if (!this.detector || video.readyState < 2) {
            this.scheduleFrame();
            return;
        }

        try {
            const results = await this.detector.detect(video);
            if (results.length > 0) {
                this.stop();
                this.detected.emit(results[0].rawValue);
                return;
            }
        } catch {

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
        this.errorMsg.set(isDenied ? 'Camera access denied. Please allow camera in your browser settings.' : msg);
        this.state.set('error');
    }
}
