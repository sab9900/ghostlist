export type ItemPriority = 'important' | 'optional';
export type ItemSortOrder = 'createdAt' | 'az' | 'za' | 'priority';

export interface DecryptedItem {
    id: string;
    text: string;
    isChecked: boolean;
    checkedAt: string | null;
    createdAt: string;
    isNew: boolean;
    creatorName: string | null;
    checkedByName: string | null;
    priority: ItemPriority | null;
}

export interface ActiveReminder {
    id: string;
    remindAt: string;
}
