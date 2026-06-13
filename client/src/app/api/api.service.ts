import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import {
    CreateGhostListItemRequest,
    CreateGhostMessageRequest,
    GhostChatMessage,
    GhostList,
    GhostListItem,
    GhostMessageImageDto,
    InfoMessage,
    ListMember,
    ReadReceiptRequest,
    ShareDelivery,
    SubscribeRequest,
    UnreadSummary,
    UpdateTtlRequest,
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

    updateTtl(id: string, ttl: UpdateTtlRequest): Observable<void> {
        return this.http.patch<void>(
            `${this.BASE}/ghostlist/${id}/ttl`,
            JSON.stringify(ttl),
            { headers: { 'Content-Type': 'application/json' } },
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
            { headers: this.deviceIdHeaders() });
    }

    deleteItem(id: string): Observable<void> {
        return this.http.delete<void>(`${this.BASE}/ghostitems/${id}`,
            { headers: this.deviceIdHeaders() });
    }

    getMessages(listId: string): Observable<GhostChatMessage[]> {
        return this.http.get<GhostChatMessage[]>(`${this.BASE}/chat/${listId}`);
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

    getMessageImage(messageId: string): Observable<GhostMessageImageDto> {
        return this.http.get<GhostMessageImageDto>(`${this.BASE}/chat/${messageId}/image`);
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
        return this.http.delete<void>(`${this.BASE}/members/${listId}/${deviceId}`);
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

    putSyncBundle(sessionId: string, encryptedPayload: string, iv: string, senderPublicKey: string): Observable<void> {
        return this.http.put<void>(`${this.BASE}/share/${sessionId}/sync-bundle`, { encryptedPayload, iv, senderPublicKey });
    }

    getSyncBundle(sessionId: string): Observable<{ encryptedPayload: string; iv: string; senderPublicKey: string }> {
        return this.http.get<{ encryptedPayload: string; iv: string; senderPublicKey: string }>(
            `${this.BASE}/share/${sessionId}/sync-bundle`,
        );
    }

    getBackendVersion(): Observable<{ version: string }> {
        return this.http.get<{ version: string }>(`${this.BASE}/version`);
    }

    getLatestInfoMessage(): Observable<InfoMessage | null> {
        return this.http.get<InfoMessage | null>(`${this.BASE}/info/latest`);
    }
}
