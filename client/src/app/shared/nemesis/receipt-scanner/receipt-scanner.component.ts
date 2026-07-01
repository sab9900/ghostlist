import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, EventEmitter, OnDestroy, Output, ViewChild } from '@angular/core';
import { LucideImage, LucideX } from '@lucide/angular';
import { TranslatePipe } from '@ngx-translate/core';
import { OcrResult, OcrService, OcrWord } from '../../../core/services/ocr.service';
import { PdfRenderService } from '../../../core/services/pdf-render.service';

export interface ScanConfirmResult {
    blob: Blob;
    detectedAmount: number | null;
    detectedDescription: string | null;
}

type ScanState = 'initializing' | 'live' | 'stable' | 'processing' | 'result' | 'error';

function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function loadImageDimensions(url: string): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
        img.onerror = () => reject(new Error('Bild konnte nicht geladen werden'));
        img.src = url;
    });
}

function scaleOcrResult(result: OcrResult, factor: number): OcrResult {
    return {
        ...result,
        words: result.words.map(w => ({
            ...w,
            bbox: {
                x0: w.bbox.x0 * factor,
                y0: w.bbox.y0 * factor,
                x1: w.bbox.x1 * factor,
                y1: w.bbox.y1 * factor,
            },
        })),
    };
}

@Component({
    selector: 'app-receipt-scanner',
    standalone: true,
    imports: [CommonModule, TranslatePipe, LucideImage, LucideX],
    templateUrl: './receipt-scanner.component.html',
    styleUrls: ['./receipt-scanner.component.scss'],
})
export class ReceiptScannerComponent implements AfterViewInit, OnDestroy {
    @Output() confirmed = new EventEmitter<ScanConfirmResult>();
    @Output() cancelled = new EventEmitter<void>();

    @ViewChild('videoEl') videoRef!: ElementRef<HTMLVideoElement>;
    @ViewChild('captureCanvas') captureRef!: ElementRef<HTMLCanvasElement>;
    @ViewChild('motionCanvas') motionRef!: ElementRef<HTMLCanvasElement>;
    @ViewChild('ocrCanvas') ocrCanvasRef!: ElementRef<HTMLCanvasElement>;
    @ViewChild('fileInput') fileInputRef!: ElementRef<HTMLInputElement>;

    protected state: ScanState = 'initializing';
    protected capturedImageUrl: string | null = null;
    protected ocrResult: OcrResult | null = null;
    protected svgViewBox = '0 0 1 1';
    protected errorMessage: string | null = null;

    private stream: MediaStream | null = null;
    private motionTimer: ReturnType<typeof setInterval> | null = null;
    private prevFrameData: ImageData | null = null;
    private stableCount = 0;
    private capturedBlob: Blob | null = null;
    private objectUrl: string | null = null;

    private cameraStartedAt = 0;
    private hasSeenMotion = false;

    private liveOcrActive = false;
    private liveOcrGeneration = 0;
    private lastOcrAt = 0;
    private ocrBusy = false;

    private readonly INTERVAL_MS = 350;
    private readonly STABLE_THRESHOLD = 10;

    private readonly STABLE_NEEDED = 6;
    private readonly MOTION_W = 160;
    private readonly MOTION_H = 90;
    private readonly WARMUP_MS = 900;

    private readonly OCR_W = 640;
    private readonly LIVE_OCR_INTERVAL_MS = 700;
    private readonly OCR_FRESH_MS = 1500;

    constructor(
        private readonly ocr: OcrService,
        private readonly pdfRender: PdfRenderService,
    ) { }

    async ngAfterViewInit(): Promise<void> {
        await this.startCamera();
    }

    ngOnDestroy(): void {
        this.stopAll();
    }

    private async startCamera(): Promise<void> {
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
                audio: false,
            });
            const video = this.videoRef.nativeElement;
            video.srcObject = this.stream;
            await video.play();
            this.svgViewBox = `0 0 ${video.videoWidth} ${video.videoHeight}`;
            this.state = 'live';
            this.startMotion();
            this.startLiveOcr();
        } catch {
            this.state = 'error';
            this.errorMessage = 'NEMESIS.SCANNER_CAMERA_DENIED';
        }
    }

    private startMotion(): void {
        this.stableCount = 0;
        this.prevFrameData = null;
        this.hasSeenMotion = false;
        this.cameraStartedAt = Date.now();
        this.motionTimer = setInterval(() => this.tick(), this.INTERVAL_MS);
    }

    private tick(): void {
        if (this.state !== 'live' && this.state !== 'stable') return;
        const video = this.videoRef.nativeElement;
        if (video.readyState < 2 || video.videoWidth === 0) return;

        const canvas = this.motionRef.nativeElement;
        canvas.width = this.MOTION_W;
        canvas.height = this.MOTION_H;
        const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
        ctx.drawImage(video, 0, 0, this.MOTION_W, this.MOTION_H);
        const frame = ctx.getImageData(0, 0, this.MOTION_W, this.MOTION_H);

        if (this.prevFrameData) {
            const diff = this.frameDiff(this.prevFrameData, frame);
            const stillWarmingUp = Date.now() - this.cameraStartedAt < this.WARMUP_MS;

            if (diff >= this.STABLE_THRESHOLD) {
                this.hasSeenMotion = true;
                this.stableCount = 0;
                this.state = 'live';
            } else if (!stillWarmingUp && this.hasSeenMotion) {
                this.stableCount++;
                this.state = 'stable';
                if (this.stableCount >= this.STABLE_NEEDED) {
                    void this.capture();
                    return;
                }
            }
        }
        this.prevFrameData = frame;
    }

    private frameDiff(a: ImageData, b: ImageData): number {
        let sum = 0;
        for (let i = 0; i < a.data.length; i += 4) {
            sum += Math.abs(a.data[i] - b.data[i]);
            sum += Math.abs(a.data[i + 1] - b.data[i + 1]);
            sum += Math.abs(a.data[i + 2] - b.data[i + 2]);
        }
        return sum / (a.data.length / 4);
    }

    private startLiveOcr(): void {
        this.liveOcrActive = true;
        const generation = ++this.liveOcrGeneration;
        void this.liveOcrLoop(generation);
    }

    private stopLiveOcr(): void {
        this.liveOcrActive = false;
        this.liveOcrGeneration++;
    }

    private async liveOcrLoop(generation: number): Promise<void> {
        while (this.liveOcrActive && generation === this.liveOcrGeneration) {
            if (this.state === 'live' || this.state === 'stable') {
                await this.runLiveOcrTick(generation);
            }
            await delay(this.LIVE_OCR_INTERVAL_MS);
        }
    }

    private async runLiveOcrTick(generation: number): Promise<void> {
        if (this.ocrBusy) return;
        const video = this.videoRef?.nativeElement;
        if (!video || video.readyState < 2 || video.videoWidth === 0) return;

        const scale = this.OCR_W / video.videoWidth;
        const ocrH = Math.max(1, Math.round(video.videoHeight * scale));
        const canvas = this.ocrCanvasRef.nativeElement;
        canvas.width = this.OCR_W;
        canvas.height = ocrH;
        canvas.getContext('2d')!.drawImage(video, 0, 0, this.OCR_W, ocrH);

        const blob = await new Promise<Blob | null>(res => canvas.toBlob(b => res(b), 'image/jpeg', 0.85));
        if (!blob || generation !== this.liveOcrGeneration) return;

        this.ocrBusy = true;
        try {
            const result = await this.ocr.scan(blob);
            if (generation !== this.liveOcrGeneration) return;
            if (this.state !== 'live' && this.state !== 'stable') return;
            this.ocrResult = scaleOcrResult(result, 1 / scale);
            this.lastOcrAt = Date.now();
        } catch {
        } finally {
            this.ocrBusy = false;
        }
    }

    private async capture(): Promise<void> {
        this.stopMotion();
        this.stopLiveOcr();
        this.state = 'processing';

        const video = this.videoRef.nativeElement;
        const canvas = this.captureRef.nativeElement;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d')!.drawImage(video, 0, 0);

        this.capturedBlob = await new Promise<Blob>(res =>
            canvas.toBlob(b => res(b!), 'image/jpeg', 0.92));

        if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
        this.objectUrl = URL.createObjectURL(this.capturedBlob);
        this.capturedImageUrl = this.objectUrl;

        this.stopStream();

        const hasFreshLiveResult = this.ocrResult !== null && (Date.now() - this.lastOcrAt) < this.OCR_FRESH_MS;
        if (!hasFreshLiveResult) {
            try {
                this.ocrResult = await this.ocr.scan(this.capturedBlob);
            } catch {
                this.ocrResult = null;
            }
        }
        this.state = 'result';
    }

    protected shutterTap(): void {
        if (this.state !== 'live' && this.state !== 'stable') return;
        void this.capture();
    }

    protected pickFromGallery(): void {
        this.fileInputRef.nativeElement.click();
    }

    protected async onFileSelected(event: Event): Promise<void> {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0] ?? null;
        input.value = '';
        if (!file) return;

        this.stopMotion();
        this.stopLiveOcr();
        this.stopStream();
        this.state = 'processing';

        let imageBlob: Blob = file;
        if (file.type === 'application/pdf') {
            try {
                imageBlob = await this.pdfRender.renderFirstPageToBlob(file);
            } catch {
                this.state = 'error';
                this.errorMessage = 'NEMESIS.SCANNER_PDF_FAILED';
                return;
            }
        }

        this.capturedBlob = imageBlob;
        if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
        this.objectUrl = URL.createObjectURL(imageBlob);
        this.capturedImageUrl = this.objectUrl;

        try {
            const dims = await loadImageDimensions(this.objectUrl);
            this.svgViewBox = `0 0 ${dims.width} ${dims.height}`;
        } catch {
            this.svgViewBox = '0 0 1 1';
        }

        try {
            this.ocrResult = await this.ocr.scan(imageBlob);
        } catch {
            this.ocrResult = null;
        }
        this.state = 'result';
    }

    protected retry(): void {
        this.state = 'initializing';
        this.capturedImageUrl = null;
        this.ocrResult = null;
        this.capturedBlob = null;
        this.stableCount = 0;
        this.prevFrameData = null;
        void this.startCamera();
    }

    protected confirm(): void {
        if (!this.capturedBlob) return;
        this.confirmed.emit({
            blob: this.capturedBlob,
            detectedAmount: this.ocrResult?.detectedAmount ?? null,
            detectedDescription: this.ocrResult ? this.ocr.extractDescription(this.ocrResult.text) : null,
        });
    }

    private stopMotion(): void {
        if (this.motionTimer !== null) {
            clearInterval(this.motionTimer);
            this.motionTimer = null;
        }
    }

    private stopStream(): void {
        this.stream?.getTracks().forEach(t => t.stop());
        this.stream = null;
    }

    private stopAll(): void {
        this.stopMotion();
        this.stopLiveOcr();
        this.stopStream();
        if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    }

    protected get words(): OcrWord[] {
        return this.ocrResult?.words.filter(w => w.confidence > 40) ?? [];
    }

    protected get detectedAmount(): number | null {
        return this.ocrResult?.detectedAmount ?? null;
    }

    protected get detectedDescription(): string | null {
        return this.ocrResult ? this.ocr.extractDescription(this.ocrResult.text) : null;
    }

    protected get isLive(): boolean {
        return this.state === 'live' || this.state === 'stable';
    }

    protected get isFrozen(): boolean {
        return this.state === 'processing' || this.state === 'result';
    }

    protected get liveHasData(): boolean {
        return this.detectedAmount !== null || this.detectedDescription !== null;
    }

    protected get showOverlay(): boolean {
        return (this.isLive || this.state === 'result') && this.ocrResult !== null;
    }
}
