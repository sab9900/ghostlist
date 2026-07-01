export enum VerificationStatus {
    Pending = 'Pending',
    Verified = 'Verified',
    Rejected = 'Rejected',
}

export enum SettlementStatus {
    Pending = 0,
    Confirmed = 1,
    Declined = 2,
    Expired = 3,
    Voided = 4,
    Forgiven = 5,
}

export interface NemesisVerificationDto {
    verifiedByUserId: string;
    verifiedAt: string;
}

export interface NemesisExpenseDto {
    id: string;
    ghostListId: string;
    encryptedPayload: string;
    payloadInitializationVector: string;
    status: VerificationStatus;
    splitCount: number;
    isArchived: boolean;
    createdAt: string;
    createdByDeviceId: string | null;
    createdByUserId: string | null;
    encryptedReceiptKey: string | null;
    receiptBlobKey: string | null;
    verifications: NemesisVerificationDto[];
}

export interface NemesisSettlementDto {
    id: string;
    ghostListId: string;
    encryptedPayload: string;
    payloadInitializationVector: string;
    isPaidByPayer: boolean;
    isConfirmedByReceiver: boolean;
    paidAt: string | null;
    confirmedAt: string | null;
    payerDeviceId: string | null;
    payerUserId: string | null;
    receiverUserId: string | null;
    status: SettlementStatus;
    resolvedAt: string | null;
    createdAt: string;
}

export interface NemesisDataDto {
    expenses: NemesisExpenseDto[];
    settlements: NemesisSettlementDto[];
    nemesisSettlementExpiryDays: number;
    nemesisSettlementHideAfterDays: number;
}

export interface DecryptedExpense {
    id: string;
    ghostListId: string;
    status: VerificationStatus;
    splitCount: number;
    isArchived: boolean;
    createdAt: string;
    createdByUserId: string | null;
    verifications: NemesisVerificationDto[];
    amount: number;
    currency: string;
    description: string;
    paidByUserId: string;
    splitBetween: string[];
    hasReceipt: boolean;
}

export interface ArchivedExpensesDto {
    expenses: NemesisExpenseDto[];
    nextCursor: string | null;
}

export interface DecryptedSettlement {
    id: string;
    ghostListId: string;
    fromUserId: string;
    toUserId: string;
    amount: number;
    currency: string;
    isPaidByPayer: boolean;
    isConfirmedByReceiver: boolean;
    paidAt: string | null;
    confirmedAt: string | null;
    payerUserId: string | null;
    receiverUserId: string | null;
    status: SettlementStatus;
    resolvedAt: string | null;
}

export interface DebtEntry {
    fromUserId: string;
    toUserId: string;
    amount: number;
    currency: string;
}

export interface CreateExpenseRequest {
    ghostListId: string;
    encryptedPayload: string;
    payloadInitializationVector: string;
    splitCount: number;
    splitBetweenUserIds: string[];
}

export interface SaveReceiptRequest {
    encryptedReceipt: string;
    receiptIv: string;
}

export interface NemesisReceiptDto {
    encryptedReceipt: string;
    receiptIv: string;
}

export interface SubmitSettlementRequest {
    ghostListId: string;
    encryptedPayload: string;
    payloadInitializationVector: string;
    receiverUserId?: string;
}

export interface UpdateNemesisSettingsRequest {
    expiryDays: number;
    hideAfterDays: number;
}
