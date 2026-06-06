import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import {
    CreateGhostListItemRequest,
    CreateGhostMessageRequest,
    GhostChatMessage,
    GhostList,
    GhostListItem,
    ShareDelivery,
    UpdateTtlRequest,
} from '../core/models';
import { Capacitor } from '@capacitor/core';
import { environment } from '../../environments/environment';
import { DeviceTokenService } from '../core/services/device-token.service';

@Injectable({ providedIn: 'root' })
export class ApiService {
    private readonly http = inject(HttpClient);
    private readonly tokenService = inject(DeviceTokenService);
    private readonly BASE = Capacitor.isNativePlatform()
        ? environment.nativeApiBaseUrl
        : environment.apiBaseUrl;

    /** Returns headers containing the FCM device token if available. */
    private deviceTokenHeaders(): Record<string, string> {
        const t = this.tokenService.token();
        return t ? { 'X-Device-Token': t } : {};
    }

    createList(): Observable<string> {
        return this.http.post<string>(`${this.BASE}/ghostlist`, null);
    }

    getList(id: string): Observable<GhostList> {
        return this.http.get<GhostList>(`${this.BASE}/ghostlist/${id}`);
    }

    checkList(id: string): Observable<void> {
        return this.http.head<void>(`${this.BASE}/ghostlist/${id}`);
    }

    deleteList(id: string): Observable<void> {
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
            { headers: this.deviceTokenHeaders() });
    }

    toggleItem(id: string): Observable<void> {
        return this.http.put<void>(`${this.BASE}/ghostitems/${id}/toggle`, null);
    }

    deleteItem(id: string): Observable<void> {
        return this.http.delete<void>(`${this.BASE}/ghostitems/${id}`);
    }

    getMessages(listId: string): Observable<GhostChatMessage[]> {
        return this.http.get<GhostChatMessage[]>(`${this.BASE}/chat/${listId}`);
    }

    createMessage(request: CreateGhostMessageRequest): Observable<string> {
        return this.http.post<string>(`${this.BASE}/chat`, request,
            { headers: this.deviceTokenHeaders() });
    }

    subscribeToList(listId: string): Observable<void> {
        return this.http.put<void>(`${this.BASE}/subscriptions/${listId}`, null,
            { headers: this.deviceTokenHeaders() });
    }

    unsubscribeFromList(listId: string): Observable<void> {
        return this.http.delete<void>(`${this.BASE}/subscriptions/${listId}`,
            { headers: this.deviceTokenHeaders() });
    }

    deleteMessage(id: string): Observable<void> {
        return this.http.delete<void>(`${this.BASE}/chat/${id}`);
    }

    deliverShare(sessionId: string, delivery: ShareDelivery): Observable<void> {
        return this.http.put<void>(`${this.BASE}/share/${sessionId}`, delivery);
    }

    pollShare(sessionId: string): Observable<ShareDelivery> {
        return this.http.get<ShareDelivery>(`${this.BASE}/share/${sessionId}`);
    }
}
