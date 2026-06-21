export function formatReminderDate(isoStr: string): string {
    const d = new Date(isoStr);
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfTomorrow = new Date(startOfToday.getTime() + 86_400_000);
    const startOfDayAfter = new Date(startOfTomorrow.getTime() + 86_400_000);
    const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (d >= startOfToday && d < startOfTomorrow) return timeStr;
    if (d >= startOfTomorrow && d < startOfDayAfter) return `+1d ${timeStr}`;
    return d.toLocaleDateString([], { day: 'numeric', month: 'numeric' }) + ' ' + timeStr;
}
