export function dataUrlToBlob(dataUrl: string): Blob {
    const marker = ';base64,';
    const markerIndex = dataUrl.indexOf(marker);
    const header = markerIndex >= 0 ? dataUrl.slice(0, markerIndex) : dataUrl.split(',')[0];
    const b64 = markerIndex >= 0 ? dataUrl.slice(markerIndex + marker.length) : dataUrl.split(',')[1];
    const mime = header.match(/^data:([^;]*)/)?.[1] ?? 'audio/webm';
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    return new Blob([bytes.buffer], { type: mime });
}
