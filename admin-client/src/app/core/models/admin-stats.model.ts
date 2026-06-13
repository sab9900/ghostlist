/** Snapshot of currently-existing rows. Shrinks as the cleanup jobs purge old data. */
export interface AdminCurrentCounts {
    lists: number;
    items: number;
    messages: number;
    members: number;
    deviceSubscriptions: number;
    /** Distinct stable "person" identities (userId) seen across all current members. */
    uniqueUsers: number;
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

/** Derived engagement metrics computed from the current snapshot of data. */
export interface AdminEngagement {
    avgItemsPerList: number;
    avgMembersPerList: number;
    itemCompletionRate: number;
    collaborativeListsShare: number;
    pushOptInRate: number;
    platformIos: number;
    platformAndroid: number;
    platformWeb: number;
    multiDeviceUserShare: number;
}

export interface AdminStats {
    current: AdminCurrentCounts;
    allTime: AdminTotalCounts;
    daily: AdminDailyStat[];
    engagement: AdminEngagement;
}
