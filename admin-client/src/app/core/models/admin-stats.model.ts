/** Snapshot of currently-existing rows. Shrinks as the cleanup jobs purge old data. */
export interface AdminCurrentCounts {
    lists: number;
    items: number;
    messages: number;
    members: number;
    deviceSubscriptions: number;
}

/** Cumulative counters since tracking started. Never decrease. */
export interface AdminTotalCounts {
    lists: number;
    items: number;
    messages: number;
    members: number;
}

export interface AdminDailyStat {
    date: string;
    lists: number;
    items: number;
    messages: number;
    members: number;
}

export interface AdminStats {
    current: AdminCurrentCounts;
    allTime: AdminTotalCounts;
    daily: AdminDailyStat[];
}
