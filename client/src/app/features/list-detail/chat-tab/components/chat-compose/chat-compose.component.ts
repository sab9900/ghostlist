import { Component, ElementRef, computed, input, model, output, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideImage, LucideMic, LucideSquare, LucideSwitchCamera, LucideVideo } from '@lucide/angular';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
    selector: 'app-chat-compose',
    imports: [FormsModule, TranslatePipe, LucideImage, LucideMic, LucideSquare, LucideVideo, LucideSwitchCamera],
    templateUrl: './chat-compose.component.html',
    styleUrl: './chat-compose.component.scss',
})
export class ChatComposeComponent {
    readonly text = model('');
    readonly hasText = computed(() => !!this.text().trim());
    readonly sendingImage = input(false);
    readonly sendingAudio = input(false);
    readonly sendingVideo = input(false);
    readonly recording = input(false);
    readonly recordingSeconds = input(0);
    readonly fileTooLarge = input(false);
    readonly recordingNotSupported = input(false);
    readonly recordingPermissionDenied = input(false);
    readonly recordingDebugError = input<string | null>(null);
    readonly recordingVideo = input(false);
    readonly recordingVideoSeconds = input(0);
    readonly videoRecordingNotSupported = input(false);
    readonly videoRecordingPermissionDenied = input(false);
    readonly videoRecordingDebugError = input<string | null>(null);
    readonly canSwitchCamera = input(false);

    readonly send = output<void>();
    readonly pickImage = output<void>();
    readonly toggleRecord = output<void>();
    readonly toggleVideoRecord = output<void>();
    readonly switchCamera = output<void>();
    readonly keydown = output<KeyboardEvent>();
    readonly fileSelected = output<Event>();

    readonly fileInput = viewChild<ElementRef<HTMLInputElement>>('fileInput');
    readonly textarea = viewChild<ElementRef<HTMLTextAreaElement>>('textarea');
    readonly videoPreview = viewChild<ElementRef<HTMLVideoElement>>('videoPreview');

    focusInput(): void {
        this.textarea()?.nativeElement?.focus();
    }

    autoResize(event: Event): void {
        const el = event.target as HTMLTextAreaElement;
        el.style.height = 'auto';
        el.style.height = el.scrollHeight + 'px';
    }

    protected formatRecordingTime(seconds: number): string {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    }
}
