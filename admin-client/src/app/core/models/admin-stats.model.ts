
export interface AdminCurrentCounts {
    lists: number;
    items: number;
    messages: number;
    members: number;
    deviceSubscriptions: number;
    uniqueUsers: number;
    distinctDevices: number;
}

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

export interface AdminEngagement {
    avgItemsPerList: number;
    avgMembersPerList: number;
    avgMembersPerCollaborativeList: number;
    collaborativeListsShare: number;
    protectedListsShare: number;
    pushOptInRate: number;
    platformIos: number;
    platformAndroid: number;
    platformWeb: number;
    multiDeviceUserShare: number;
    activeLists7d: number;
    activeLists30d: number;
    charonDropCount: number;
    activeReminderCount: number;
    reminderSentRate: number;
}

export interface AdminLanguageStat {
    language: string;
    count: number;
    share: number;
}

export interface AdminCountryStat {
    country: string;
    count: number;
    share: number;
}

export interface AdminLocaleBreakdown {
    languages: AdminLanguageStat[];
    countries: AdminCountryStat[];
    unknownCountryShare: number;
}

export interface AdminTtlStat {
    label: string;
    count: number;
    share: number;
}

export interface AdminStats {
    current: AdminCurrentCounts;
    allTime: AdminTotalCounts;
    daily: AdminDailyStat[];
    engagement: AdminEngagement;
    localeBreakdown: AdminLocaleBreakdown;
    ttlBreakdown: AdminTtlStat[];
}
