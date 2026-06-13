import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { CreateInfoMessageRequest, InfoMessage } from '../models/info-message.model';

@Injectable({ providedIn: 'root' })
export class InfoMessagesService {
    private readonly http = inject(HttpClient);
    private readonly BASE = `${environment.apiBaseUrl}/admin/info`;

    /** All broadcast messages, newest first. */
    getAll(): Observable<InfoMessage[]> {
        return this.http.get<InfoMessage[]>(this.BASE);
    }

    create(request: CreateInfoMessageRequest): Observable<string> {
        return this.http.post<string>(this.BASE, request);
    }

    delete(id: string): Observable<void> {
        return this.http.delete<void>(`${this.BASE}/${id}`);
    }
}
