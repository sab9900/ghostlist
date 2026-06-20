import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class IcalService {
    private get baseUrl(): string {
        return Capacitor.isNativePlatform() ? environment.nativeShareBaseUrl : location.origin;
    }

    download(listId: string, itemId: string, remindAt: string): void {
        const deepLink = `${this.baseUrl}/list/${listId}/items?highlight=${itemId}`;
        this.trigger(deepLink, remindAt, `${Date.now()}-${itemId}@ghostlist`);
    }

    downloadForList(listId: string, remindAt: string): void {
        const deepLink = `${this.baseUrl}/list/${listId}/items`;
        this.trigger(deepLink, remindAt, `${Date.now()}-list-${listId}@ghostlist`);
    }

    private trigger(deepLink: string, remindAt: string, uid: string): void {
        const start = new Date(remindAt);
        const end = new Date(start.getTime() + 15 * 60 * 1000);
        const startIcal = this.toIcalDate(start);

        const ics = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//GhostList//GhostList//EN',
            'BEGIN:VEVENT',
            `UID:${uid}`,
            `DTSTAMP:${this.toIcalDate(new Date())}`,
            `DTSTART:${startIcal}`,
            `DTEND:${this.toIcalDate(end)}`,
            'SUMMARY:GhostList',
            `URL:${deepLink}`,
            `DESCRIPTION:${deepLink}`,
            'BEGIN:VALARM',
            `TRIGGER;VALUE=DATE-TIME:${startIcal}`,
            'ACTION:DISPLAY',
            'DESCRIPTION:GhostList',
            'END:VALARM',
            'END:VEVENT',
            'END:VCALENDAR',
        ].join('\r\n');

        const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'ghostlist-reminder.ics';
        a.click();
        URL.revokeObjectURL(url);
    }

    private toIcalDate(d: Date): string {
        return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    }
}
