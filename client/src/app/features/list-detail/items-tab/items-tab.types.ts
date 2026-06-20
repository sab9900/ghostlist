export interface DecryptedItem {
    id: string;
    text: string;
    isChecked: boolean;
    checkedAt: string | null;
    createdAt: string;
    isNew: boolean;
    creatorName: string | null;
    checkedByName: string | null;
}

export interface ActiveReminder {
    id: string;
    remindAt: string;
}

export interface ReminderBanner {
    reminderId: string;
    itemId: string;
    itemText: string;
}
