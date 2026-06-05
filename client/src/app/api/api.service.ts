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

@Injectable({ providedIn: 'root' })
export class ApiService {
    private readonly http = inject(HttpClient);
    private readonly BASE = Capacitor.isNativePlatform()
        ? environment.nativeApiBaseUrl
        : environment.apiBaseUrl;

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
        return this.http.post<string>(`${this.BASE}/ghostitems`, request);
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
        return this.http.post<string>(`${this.BASE}/chat`, request);
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
