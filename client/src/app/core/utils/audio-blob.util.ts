export function dataUrlToBlob(dataUrl: string): Blob {
    const [header, b64] = dataUrl.split(',');
    const mime = header.match(/:(.*?);/)?.[1] ?? 'audio/webm';
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    return new Blob([bytes.buffer], { type: mime });
}
