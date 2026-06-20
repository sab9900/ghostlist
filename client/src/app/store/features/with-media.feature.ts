import { inject } from '@angular/core';
import { patchState, WritableStateSource } from '@ngrx/signals';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../api/api.service';
import { HubService } from '../../api/hub.service';
import { CryptoService } from '../../core/services/crypto.service';
import { dataUrlToBlob } from '../../core/utils/audio-blob.util';

const IMAGE_CACHE_LIMIT = 30;
const AUDIO_CACHE_LIMIT = 20;

export interface MediaStoreSlice extends WritableStateSource<{ imageDataUrls: Record<string, string>; audioDataUrls: Record<string, string> }> {
    currentListId: () => string | null;
    currentEncryptionKey: () => string | null;
    imageDataUrls: () => Record<string, string>;
    audioDataUrls: () => Record<string, string>;
}

export function createMediaMethods(store: MediaStoreSlice) {
    const api = inject(ApiService);
    const hub = inject(HubService);
    const crypto = inject(CryptoService);

    const imageCacheOrder: string[] = [];
    const audioCacheOrder: string[] = [];

    function cacheImage(messageId: string, dataUrl: string): void {
        const current = store.imageDataUrls();
        if (!(messageId in current)) {
            imageCacheOrder.push(messageId);
            if (imageCacheOrder.length > IMAGE_CACHE_LIMIT) {
                const evict = imageCacheOrder.shift();
                if (evict && evict in store.imageDataUrls()) {
                    const rest = { ...store.imageDataUrls() };
                    delete rest[evict];
                    patchState(store, { imageDataUrls: rest });
                }
            }
        }
        patchState(store, { imageDataUrls: { ...store.imageDataUrls(), [messageId]: dataUrl } });
    }

    function cacheAudio(messageId: string, blobUrl: string): void {
        const current = store.audioDataUrls();
        if (!(messageId in current)) {
            audioCacheOrder.push(messageId);
            if (audioCacheOrder.length > AUDIO_CACHE_LIMIT) {
                const evict = audioCacheOrder.shift();
                if (evict && evict in store.audioDataUrls()) {
                    URL.revokeObjectURL(store.audioDataUrls()[evict]);
                    const rest = { ...store.audioDataUrls() };
                    delete rest[evict];
                    patchState(store, { audioDataUrls: rest });
                }
            }
        }
        patchState(store, { audioDataUrls: { ...store.audioDataUrls(), [messageId]: blobUrl } });
    }

    return {
        async shareImage(dataUrl: string, plainSenderName: string, replyToMessageId?: string | null): Promise<string> {
            const listId = store.currentListId();
            const key = store.currentEncryptionKey();
            if (!listId || !key) throw new Error('No list is currently open.');

            const placeholder = JSON.stringify({ type: 'image' });
            const [msg, sender, image] = await Promise.all([
                crypto.encrypt(placeholder, key),
                crypto.encrypt(plainSenderName, key),
                crypto.encrypt(dataUrl, key),
            ]);

            const messageId = await firstValueFrom(
                api.createMessage({
                    ghostListId: listId,
                    encryptedMessage: msg.ciphertext,
                    messageInitializationVector: msg.iv,
                    encryptedSenderName: sender.ciphertext,
                    senderNameInitializationVector: sender.iv,
                    replyToMessageId: replyToMessageId ?? null,
                }),
            );

            cacheImage(messageId, dataUrl);
            await firstValueFrom(api.saveMessageImage(messageId, image.ciphertext, image.iv));

            try {
                await hub.relayImage(listId, messageId, image.ciphertext, image.iv);
            } catch { }

            return messageId;
        },

        async fetchAndCacheImage(messageId: string): Promise<void> {
            if (store.imageDataUrls()[messageId]) return;

            const key = store.currentEncryptionKey();
            if (!key) return;

            try {
                const image = await firstValueFrom(api.getMessageImage(messageId));
                const dataUrl = await crypto.decrypt(image.encryptedImage, image.imageInitializationVector, key);
                cacheImage(messageId, dataUrl);
            } catch { }
        },

        async shareAudio(dataUrl: string, plainSenderName: string, replyToMessageId?: string | null): Promise<string> {
            const listId = store.currentListId();
            const key = store.currentEncryptionKey();
            if (!listId || !key) throw new Error('No list is currently open.');

            const placeholder = JSON.stringify({ type: 'audio' });
            const [msg, sender, audio] = await Promise.all([
                crypto.encrypt(placeholder, key),
                crypto.encrypt(plainSenderName, key),
                crypto.encrypt(dataUrl, key),
            ]);

            const messageId = await firstValueFrom(
                api.createMessage({
                    ghostListId: listId,
                    encryptedMessage: msg.ciphertext,
                    messageInitializationVector: msg.iv,
                    encryptedSenderName: sender.ciphertext,
                    senderNameInitializationVector: sender.iv,
                    replyToMessageId: replyToMessageId ?? null,
                }),
            );

            const blob = dataUrlToBlob(dataUrl);
            cacheAudio(messageId, URL.createObjectURL(blob));
            await firstValueFrom(api.saveMessageAudio(messageId, audio.ciphertext, audio.iv));

            try {
                await hub.relayAudio(listId, messageId, audio.ciphertext, audio.iv);
            } catch { }

            return messageId;
        },

        async fetchAndCacheAudio(messageId: string): Promise<void> {
            if (store.audioDataUrls()[messageId]) return;

            const key = store.currentEncryptionKey();
            if (!key) return;

            try {
                const dto = await firstValueFrom(api.getMessageAudio(messageId));
                const dataUrl = await crypto.decrypt(dto.encryptedAudio, dto.audioInitializationVector, key);
                const blob = dataUrlToBlob(dataUrl);
                cacheAudio(messageId, URL.createObjectURL(blob));
            } catch { }
        },

        _cacheImage: cacheImage,
        _cacheAudio: cacheAudio,
    };
}
