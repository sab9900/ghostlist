import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import {
    CharonDropDto,
    CreateCharonDropRequest,
    CreateGhostListItemRequest,
    CreateGhostMessageRequest,
    CreateItemReminderRequest,
    CreateListReminderRequest,
    ItemReminderDto,
    ListReminderDto,
    GhostChatMessagePage,
    GhostList,
    GhostListItem,
    GhostMessageAudioDto,
    GhostMessageImageDto,
    GhostMessageVideoDto,
    InfoMessage,
    ListMember,
    MarkReadRequest,
    ReadReceiptRequest,
    ShareDelivery,
    SubscribeRequest,
    UnreadSummary,
    UpdateTtlRequest,
    UpdateWhisperLifetimeRequest,
} from '../core/models';
import { Capacitor } from '@capacitor/core';
import { environment } from '../../environments/environment';
import { DeviceTokenService } from '../core/services/device-token.service';
import { DeviceIdService } from '../core/services/device-id.service';
import { UserIdService } from '../core/services/user-id.service';

@Injectable({ providedIn: 'root' })
export class ApiService {
    private readonly http = inject(HttpClient);
    private readonly tokenService = inject(DeviceTokenService);
    private readonly deviceIdService = inject(DeviceIdService);
    private readonly userIdService = inject(UserIdService);
    private readonly BASE = Capacitor.isNativePlatform()
        ? environment.nativeApiBaseUrl
        : environment.apiBaseUrl;

    private deviceTokenHeaders(): Record<string, string> {
        const t = this.tokenService.token();
        return t ? { 'X-Device-Token': t } : {};
    }

    private deviceIdHeaders(): Record<string, string> {
        return { 'X-Device-Id': this.deviceIdService.deviceId };
    }

    private userIdHeaders(): Record<string, string> {
        return { 'X-User-Id': this.userIdService.userId() };
    }

    createList(ownerTokenHash?: string): Observable<string> {
        const body = ownerTokenHash ? { ownerTokenHash } : null;
        return this.http.post<string>(`${this.BASE}/ghostlist`, body);
    }

    getList(id: string): Observable<GhostList> {
        return this.http.get<GhostList>(`${this.BASE}/ghostlist/${id}`);
    }

    checkList(id: string): Observable<void> {
        return this.http.head<void>(`${this.BASE}/ghostlist/${id}`);
    }

    deleteList(id: string, ownerToken?: string): Observable<void> {
        if (ownerToken) {
            return this.http.delete<void>(`${this.BASE}/ghostlist/${id}`, { params: { ownerToken } });
        }
        return this.http.delete<void>(`${this.BASE}/ghostlist/${id}`);
    }

    updateTtl(id: string, ttl: UpdateTtlRequest, ownerToken?: string): Observable<void> {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (ownerToken) headers['X-Owner-Token'] = ownerToken;
        return this.http.patch<void>(
            `${this.BASE}/ghostlist/${id}/ttl`,
            JSON.stringify(ttl),
            { headers },
        );
    }

    updateWhisperLifetime(id: string, lifetime: UpdateWhisperLifetimeRequest, ownerToken?: string): Observable<void> {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (ownerToken) headers['X-Owner-Token'] = ownerToken;
        return this.http.patch<void>(
            `${this.BASE}/ghostlist/${id}/whisper-lifetime`,
            JSON.stringify(lifetime),
            { headers },
        );
    }

    getItems(listId: string): Observable<GhostListItem[]> {
        return this.http.get<GhostListItem[]>(`${this.BASE}/ghostitems/${listId}`);
    }

    createItem(request: CreateGhostListItemRequest): Observable<string> {
        return this.http.post<string>(`${this.BASE}/ghostitems`, request,
            { headers: { ...this.deviceTokenHeaders(), ...this.deviceIdHeaders(), ...this.userIdHeaders() } });
    }

    toggleItem(id: string): Observable<void> {
        return this.http.put<void>(`${this.BASE}/ghostitems/${id}/toggle`, null,
            { headers: { ...this.deviceIdHeaders(), ...this.userIdHeaders() } });
    }

    deleteItem(id: string): Observable<void> {
        return this.http.delete<void>(`${this.BASE}/ghostitems/${id}`,
            { headers: this.deviceIdHeaders() });
    }

    getMessages(listId: string, before?: string, take = 50): Observable<GhostChatMessagePage> {
        const params: Record<string, string> = { take: String(take) };
        if (before) params['before'] = before;
        return this.http.get<GhostChatMessagePage>(`${this.BASE}/chat/${listId}`, { params });
    }

    createMessage(request: CreateGhostMessageRequest): Observable<string> {
        return this.http.post<string>(`${this.BASE}/chat`, request,
            { headers: { ...this.deviceTokenHeaders(), ...this.deviceIdHeaders(), ...this.userIdHeaders() } });
    }

    subscribeToList(listId: string, request: SubscribeRequest): Observable<void> {
        return this.http.put<void>(`${this.BASE}/subscriptions/${listId}`, request,
            { headers: this.deviceIdHeaders() });
    }

    unsubscribeFromList(listId: string): Observable<void> {
        return this.http.delete<void>(`${this.BASE}/subscriptions/${listId}`,
            { headers: this.deviceIdHeaders() });
    }

    deleteMessage(id: string): Observable<void> {
        return this.http.delete<void>(`${this.BASE}/chat/${id}`);
    }

    saveMessageImage(messageId: string, encryptedImage: string, imageInitializationVector: string): Observable<void> {
        return this.http.post<void>(`${this.BASE}/chat/${messageId}/image`, { encryptedImage, imageInitializationVector });
    }

    saveMessageAudio(messageId: string, encryptedAudio: string, audioInitializationVector: string): Observable<void> {
        return this.http.post<void>(`${this.BASE}/chat/${messageId}/audio`, { encryptedAudio, audioInitializationVector });
    }

    getMessageImage(messageId: string): Observable<GhostMessageImageDto> {
        return this.http.get<GhostMessageImageDto>(`${this.BASE}/chat/${messageId}/image`);
    }

    getMessageAudio(messageId: string): Observable<GhostMessageAudioDto> {
        return this.http.get<GhostMessageAudioDto>(`${this.BASE}/chat/${messageId}/audio`);
    }

    saveMessageVideo(messageId: string, encryptedVideo: string, videoInitializationVector: string): Observable<void> {
        return this.http.post<void>(`${this.BASE}/chat/${messageId}/video`, { encryptedVideo, videoInitializationVector });
    }

    getMessageVideo(messageId: string): Observable<GhostMessageVideoDto> {
        return this.http.get<GhostMessageVideoDto>(`${this.BASE}/chat/${messageId}/video`);
    }

    deliverShare(sessionId: string, delivery: ShareDelivery): Observable<void> {
        return this.http.put<void>(`${this.BASE}/share/${sessionId}`, delivery);
    }

    pollShare(sessionId: string): Observable<ShareDelivery> {
        return this.http.get<ShareDelivery>(`${this.BASE}/share/${sessionId}`);
    }

    postHandshake(sessionId: string, receiverPublicKey: string): Observable<void> {
        return this.http.put<void>(`${this.BASE}/share/${sessionId}/handshake`, { receiverPublicKey });
    }

    pollHandshake(sessionId: string): Observable<{ receiverPublicKey: string }> {
        return this.http.get<{ receiverPublicKey: string }>(`${this.BASE}/share/${sessionId}/handshake`);
    }

    getMembers(listId: string): Observable<{ deviceId: string; encryptedPayload: string; initializationVector: string; lastReadMessageAt: string | null }[]> {
        return this.http.get<{ deviceId: string; encryptedPayload: string; initializationVector: string; lastReadMessageAt: string | null }[]>(
            `${this.BASE}/members/${listId}`,
        );
    }

    upsertMember(listId: string, deviceId: string, encryptedPayload: string, initializationVector: string): Observable<void> {
        return this.http.put<void>(`${this.BASE}/members/${listId}/${deviceId}`, { encryptedPayload, initializationVector },
            { headers: this.userIdHeaders() });
    }

    deleteMember(listId: string, deviceId: string): Observable<void> {
        return this.http.delete<void>(`${this.BASE}/members/${listId}/${deviceId}`,
            { headers: { ...this.deviceIdHeaders(), ...this.userIdHeaders() } });
    }

    kickMember(listId: string, deviceId: string, ownerToken: string): Observable<void> {
        return this.http.delete<void>(`${this.BASE}/members/${listId}/${deviceId}/kick`, { params: { ownerToken } });
    }

    updateReadReceipt(listId: string, deviceId: string, receipt: ReadReceiptRequest): Observable<void> {
        return this.http.put<void>(`${this.BASE}/members/${listId}/${deviceId}/read-receipt`, receipt);
    }

    getUnreadSummary(listId: string, deviceId: string): Observable<UnreadSummary> {
        return this.http.get<UnreadSummary>(`${this.BASE}/members/${listId}/${deviceId}/unread`,
            { headers: this.userIdHeaders() });
    }

    markMessagesRead(listId: string, deviceId: string, ids: string[]): Observable<void> {
        return this.http.post<void>(`${this.BASE}/members/${listId}/${deviceId}/read-receipts/messages`, { ids } satisfies MarkReadRequest,
            { headers: this.userIdHeaders() });
    }

    markItemsRead(listId: string, deviceId: string, ids: string[]): Observable<void> {
        return this.http.post<void>(`${this.BASE}/members/${listId}/${deviceId}/read-receipts/items`, { ids } satisfies MarkReadRequest,
            { headers: this.userIdHeaders() });
    }

    putSyncBundle(sessionId: string, encryptedPayload: string, iv: string, senderPublicKey: string): Observable<void> {
        return this.http.put<void>(`${this.BASE}/share/${sessionId}/sync-bundle`, { encryptedPayload, iv, senderPublicKey });
    }

    getSyncBundle(sessionId: string): Observable<{ encryptedPayload: string; iv: string; senderPublicKey: string }> {
        return this.http.get<{ encryptedPayload: string; iv: string; senderPublicKey: string }>(
            `${this.BASE}/share/${sessionId}/sync-bundle`,
        );
    }

    putSyncBundleReply(sessionId: string, encryptedPayload: string, iv: string, senderPublicKey: string): Observable<void> {
        return this.http.put<void>(`${this.BASE}/share/${sessionId}/sync-bundle-reply`, { encryptedPayload, iv, senderPublicKey });
    }

    getSyncBundleReply(sessionId: string): Observable<{ encryptedPayload: string; iv: string; senderPublicKey: string }> {
        return this.http.get<{ encryptedPayload: string; iv: string; senderPublicKey: string }>(
            `${this.BASE}/share/${sessionId}/sync-bundle-reply`,
        );
    }

    getBackendVersion(): Observable<{ version: string }> {
        return this.http.get<{ version: string }>(`${this.BASE}/version`);
    }

    getLatestInfoMessage(): Observable<InfoMessage | null> {

        return this.http.get<InfoMessage | null>(`${this.BASE}/info/latest`, {
            params: { platform: Capacitor.getPlatform() },
        });
    }

    getCharonDrops(listId: string): Observable<CharonDropDto[]> {
        return this.http.get<CharonDropDto[]>(`${this.BASE}/charon/${listId}`,
            { headers: { ...this.deviceIdHeaders(), ...this.userIdHeaders() } });
    }

    createCharonDrop(request: CreateCharonDropRequest): Observable<string> {
        return this.http.post<string>(`${this.BASE}/charon`, request,
            { headers: { ...this.deviceTokenHeaders(), ...this.deviceIdHeaders(), ...this.userIdHeaders() } });
    }

    markCharonDropViewed(dropId: string): Observable<void> {
        return this.http.post<void>(`${this.BASE}/charon/${dropId}/view`, null,
            { headers: { ...this.deviceIdHeaders(), ...this.userIdHeaders() } });
    }

    deleteCharonDrop(dropId: string): Observable<void> {
        return this.http.delete<void>(`${this.BASE}/charon/${dropId}`);
    }

    sendWhisperInvite(listId: string, targetDeviceIds?: string[]): Observable<void> {
        return this.http.post<void>(`${this.BASE}/whisper/${listId}/invite`, { targetDeviceIds: targetDeviceIds ?? null },
            { headers: this.deviceIdHeaders() });
    }

    getItemReminders(ghostListId: string): Observable<ItemReminderDto[]> {
        return this.http.get<ItemReminderDto[]>(`${this.BASE}/itemreminders`, {
            params: { ghostListId },
            headers: this.deviceIdHeaders(),
        });
    }

    createItemReminder(request: CreateItemReminderRequest): Observable<string> {
        return this.http.post<string>(`${this.BASE}/itemreminders`, request,
            { headers: this.deviceIdHeaders() });
    }

    deleteItemReminder(reminderId: string): Observable<void> {
        return this.http.delete<void>(`${this.BASE}/itemreminders/${reminderId}`,
            { headers: this.deviceIdHeaders() });
    }

    acknowledgeItemReminder(reminderId: string): Observable<void> {
        return this.http.put<void>(`${this.BASE}/itemreminders/${reminderId}/acknowledge`, null,
            { headers: this.deviceIdHeaders() });
    }

    getListReminders(ghostListId: string): Observable<ListReminderDto[]> {
        return this.http.get<ListReminderDto[]>(`${this.BASE}/listreminders`, {
            params: { ghostListId },
            headers: this.deviceIdHeaders(),
        });
    }

    createListReminder(request: CreateListReminderRequest): Observable<string> {
        return this.http.post<string>(`${this.BASE}/listreminders`, request,
            { headers: this.deviceIdHeaders() });
    }

    deleteListReminder(reminderId: string): Observable<void> {
        return this.http.delete<void>(`${this.BASE}/listreminders/${reminderId}`,
            { headers: this.deviceIdHeaders() });
    }

    acknowledgeListReminder(reminderId: string): Observable<void> {
        return this.http.put<void>(`${this.BASE}/listreminders/${reminderId}/acknowledge`, null,
            { headers: this.deviceIdHeaders() });
    }
}
