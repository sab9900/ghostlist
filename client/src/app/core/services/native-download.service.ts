import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

const EXTENSION_BY_MIME: Record<string, string> = {
    'audio/webm': 'webm',
    'audio/mp4': 'm4a',
    'audio/ogg': 'ogg',
    'audio/mpeg': 'mp3',
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
    'video/webm': 'webm',
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
};

@Injectable({ providedIn: 'root' })
export class NativeDownloadService {
    async downloadUrl(url: string, fileName: string): Promise<void> {
        const blob = await this.fetchBlob(url);
        const finalName = this.withExtension(fileName, blob.type);

        if (Capacitor.isNativePlatform()) {
            await this.shareNative(blob, finalName);
        } else {
            this.downloadWeb(blob, finalName);
        }
    }

    private async fetchBlob(url: string): Promise<Blob> {
        const response = await fetch(url);
        return response.blob();
    }

    private withExtension(fileName: string, mimeType: string): string {
        if (/\.[a-zA-Z0-9]{1,5}$/.test(fileName)) return fileName;
        const ext = EXTENSION_BY_MIME[mimeType] ?? mimeType.split('/').pop() ?? 'bin';
        return `${fileName}.${ext}`;
    }

    private async shareNative(blob: Blob, fileName: string): Promise<void> {
        const base64 = await this.blobToBase64(blob);
        await Filesystem.writeFile({
            path: fileName,
            data: base64,
            directory: Directory.Cache,
        });

        const { uri } = await Filesystem.getUri({
            path: fileName,
            directory: Directory.Cache,
        });

        await Share.share({
            files: [uri],
            dialogTitle: fileName,
        });
    }

    private downloadWeb(blob: Blob, fileName: string): void {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
    }

    private blobToBase64(blob: Blob): Promise<string> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(reader.error ?? new Error('Could not read blob'));
            reader.onload = () => {
                const result = reader.result as string;
                const marker = ';base64,';
                const idx = result.indexOf(marker);
                resolve(idx >= 0 ? result.slice(idx + marker.length) : result);
            };
            reader.readAsDataURL(blob);
        });
    }
}
