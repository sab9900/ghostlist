import { Component, ElementRef, input, model, output, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideImage, LucideMic, LucideSquare } from '@lucide/angular';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
    selector: 'app-chat-compose',
    imports: [FormsModule, TranslatePipe, LucideImage, LucideMic, LucideSquare],
    templateUrl: './chat-compose.component.html',
    styleUrl: './chat-compose.component.scss',
})
export class ChatComposeComponent {
    readonly text = model('');
    readonly sendingImage = input(false);
    readonly sendingAudio = input(false);
    readonly recording = input(false);
    readonly recordingSeconds = input(0);
    readonly fileTooLarge = input(false);
    readonly recordingNotSupported = input(false);
    readonly recordingPermissionDenied = input(false);
    readonly recordingDebugError = input<string | null>(null);

    readonly send = output<void>();
    readonly pickImage = output<void>();
    readonly toggleRecord = output<void>();
    readonly keydown = output<KeyboardEvent>();
    readonly fileSelected = output<Event>();

    readonly fileInput = viewChild<ElementRef<HTMLInputElement>>('fileInput');
    readonly textarea = viewChild<ElementRef<HTMLTextAreaElement>>('textarea');

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
