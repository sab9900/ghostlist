import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../api/api.service';
import { CryptoService } from '../../core/services/crypto.service';
import { UserIdService } from '../../core/services/user-id.service';
import { ListMember } from '../../core/models';
import {
    ArchivedExpensesDto,
    DebtEntry,
    DecryptedExpense,
    DecryptedSettlement,
    NemesisExpenseDto,
    NemesisSettlementDto,
    SettlementStatus,
    VerificationStatus,
} from '../../core/models/nemesis.model';

const RECEIPT_CACHE_LIMIT = 10;

interface NemesisState {
    listId: string | null;
    encryptionKey: string | null;
    rawExpenses: NemesisExpenseDto[];
    rawSettlements: NemesisSettlementDto[];
    decryptedExpenses: DecryptedExpense[];
    decryptedSettlements: DecryptedSettlement[];
    archivedExpenses: DecryptedExpense[];
    rawArchivedExpenses: NemesisExpenseDto[];
    archivedCursor: string | null;
    archivedHasMore: boolean;
    archivedLoading: boolean;
    showArchived: boolean;
    loading: boolean;
    error: string | null;
    justConfirmedDebtToUserId: string | null;
    receiptDataUrls: Record<string, string>;
    receiptLoadErrors: Record<string, boolean>;
    members: ListMember[];
    nemesisSettlementExpiryDays: number;
    nemesisSettlementHideAfterDays: number;
}

const initialState: NemesisState = {
    listId: null,
    encryptionKey: null,
    rawExpenses: [],
    rawSettlements: [],
    decryptedExpenses: [],
    decryptedSettlements: [],
    archivedExpenses: [],
    rawArchivedExpenses: [],
    archivedCursor: null,
    archivedHasMore: false,
    archivedLoading: false,
    showArchived: false,
    loading: false,
    error: null,
    justConfirmedDebtToUserId: null,
    receiptDataUrls: {},
    receiptLoadErrors: {},
    members: [],
    nemesisSettlementExpiryDays: 60,
    nemesisSettlementHideAfterDays: 30,
};

export const NemesisStore = signalStore(
    withState(initialState),

    withComputed((store) => ({
        verifiedExpenses: computed(() =>
            store.decryptedExpenses().filter(e => e.status === VerificationStatus.Verified)
        ),
        pendingExpenses: computed(() =>
            store.decryptedExpenses().filter(e => e.status === VerificationStatus.Pending)
        ),
        netDebts: computed(() => computeNetDebts(store.decryptedExpenses(), store.decryptedSettlements())),
        minimizedDebts: computed(() => {
            const debts = computeNetDebts(store.decryptedExpenses(), store.decryptedSettlements());
            return minimizeDebts(debts);
        }),
    })),

    withMethods((store) => {
        const api = inject(ApiService);
        const crypto = inject(CryptoService);
        const userIdService = inject(UserIdService);

        const receiptCacheOrder: string[] = [];

        function cacheReceipt(expenseId: string, dataUrl: string): void {
            if (!(expenseId in store.receiptDataUrls())) {
                receiptCacheOrder.push(expenseId);
                if (receiptCacheOrder.length > RECEIPT_CACHE_LIMIT) {
                    const evict = receiptCacheOrder.shift();
                    if (evict && evict in store.receiptDataUrls()) {
                        const rest = { ...store.receiptDataUrls() };
                        delete rest[evict];
                        patchState(store, { receiptDataUrls: rest });
                    }
                }
            }
            patchState(store, { receiptDataUrls: { ...store.receiptDataUrls(), [expenseId]: dataUrl } });
        }

        async function doDecryptExpenses(expenses: NemesisExpenseDto[], key: string): Promise<void> {
            const decrypted = await Promise.all(expenses.map(e => decryptExpense(e, key, crypto)));
            patchState(store, { decryptedExpenses: decrypted.filter((e): e is DecryptedExpense => e !== null) });
        }

        async function doDecryptSettlements(settlements: NemesisSettlementDto[], key: string): Promise<void> {
            const decrypted = await Promise.all(settlements.map(s => decryptSettlement(s, key, crypto)));
            patchState(store, { decryptedSettlements: decrypted.filter((s): s is DecryptedSettlement => s !== null) });
        }

        async function doDecryptArchivedExpenses(expenses: NemesisExpenseDto[], key: string): Promise<void> {
            const decrypted = await Promise.all(expenses.map(e => decryptExpense(e, key, crypto)));
            patchState(store, { archivedExpenses: decrypted.filter((e): e is DecryptedExpense => e !== null) });
        }

        async function doLoadData(): Promise<void> {
            const listId = store.listId();
            const key = store.encryptionKey();
            if (!listId || !key) return;
            patchState(store, { loading: true, error: null });
            try {
                const data = await firstValueFrom(api.getNemesisData(listId));
                patchState(store, {
                    rawExpenses: data.expenses,
                    rawSettlements: data.settlements,
                    nemesisSettlementExpiryDays: data.nemesisSettlementExpiryDays ?? 60,
                    nemesisSettlementHideAfterDays: data.nemesisSettlementHideAfterDays ?? 30,
                });
                await Promise.all([
                    doDecryptExpenses(data.expenses, key),
                    doDecryptSettlements(data.settlements, key),
                ]);
            } catch {
                patchState(store, { error: 'Daten konnten nicht geladen werden.' });
            } finally {
                patchState(store, { loading: false });
            }
        }

        return {
            initialize(listId: string, encryptionKey: string): void {
                patchState(store, { listId, encryptionKey });
            },

            loadData: doLoadData,

            async decryptExpenses(expenses: NemesisExpenseDto[], key: string): Promise<void> {
                return doDecryptExpenses(expenses, key);
            },

            async decryptSettlements(settlements: NemesisSettlementDto[], key: string): Promise<void> {
                return doDecryptSettlements(settlements, key);
            },

            async addExpense(payload: { splitBetween: string[]; [key: string]: unknown }, receiptBlob?: Blob): Promise<void> {
                const key = store.encryptionKey();
                const listId = store.listId();
                if (!key || !listId) return;

                const { ciphertext, iv } = await crypto.encrypt(JSON.stringify(payload), key);

                const splitBetween = payload.splitBetween as string[];
                const paidByUserId = payload['paidByUserId'] as string;
                const expenseId = await firstValueFrom(api.createExpense({
                    ghostListId: listId,
                    encryptedPayload: ciphertext,
                    payloadInitializationVector: iv,
                    splitCount: splitBetween.filter(id => id !== paidByUserId).length,
                    splitBetweenUserIds: splitBetween,
                }));

                if (receiptBlob) {
                    const receiptData = await blobToBase64(receiptBlob);
                    const { ciphertext: rCiphertext, iv: rIv } = await crypto.encrypt(receiptData, key);
                    await firstValueFrom(api.saveExpenseReceipt(expenseId, {
                        encryptedReceipt: rCiphertext,
                        receiptIv: rIv,
                    }));
                }

                await doLoadData();
            },

            async fetchAndCacheReceipt(expenseId: string): Promise<void> {
                if (store.receiptDataUrls()[expenseId]) return;

                const key = store.encryptionKey();
                if (!key) return;

                if (store.receiptLoadErrors()[expenseId]) {
                    patchState(store, { receiptLoadErrors: { ...store.receiptLoadErrors(), [expenseId]: false } });
                }

                try {
                    const receipt = await firstValueFrom(api.getExpenseReceipt(expenseId));
                    const dataUrl = await crypto.decrypt(receipt.encryptedReceipt, receipt.receiptIv, key);
                    cacheReceipt(expenseId, dataUrl);
                } catch {
                    patchState(store, { receiptLoadErrors: { ...store.receiptLoadErrors(), [expenseId]: true } });
                }
            },

            async verifyExpense(expenseId: string): Promise<void> {
                const userId = userIdService.userId();
                await firstValueFrom(api.verifyExpense(expenseId, userId));
                patchState(store, {
                    rawExpenses: store.rawExpenses().map(e =>
                        e.id === expenseId
                            ? { ...e, verifications: [...e.verifications, { verifiedByUserId: userId, verifiedAt: new Date().toISOString() }] }
                            : e
                    ),
                });
                await doLoadData();
            },

            async submitSettlement(payload: { toUserId?: string; [key: string]: unknown }): Promise<void> {
                const key = store.encryptionKey();
                const listId = store.listId();
                if (!key || !listId) return;

                const { ciphertext, iv } = await crypto.encrypt(JSON.stringify(payload), key);
                await firstValueFrom(api.submitSettlement({
                    ghostListId: listId,
                    encryptedPayload: ciphertext,
                    payloadInitializationVector: iv,
                    receiverUserId: payload.toUserId,
                }));
                await doLoadData();
            },

            async confirmSettlement(settlementId: string): Promise<void> {
                await firstValueFrom(api.confirmSettlement(settlementId));
                await doLoadData();
            },

            async declineSettlement(settlementId: string): Promise<void> {
                await firstValueFrom(api.declineSettlement(settlementId));
                await doLoadData();
            },

            async forgiveSettlement(settlementId: string): Promise<void> {
                await firstValueFrom(api.forgiveSettlement(settlementId));
                await doLoadData();
            },

            async onExpenseCreated(expense: NemesisExpenseDto): Promise<DecryptedExpense | null> {
                if (store.rawExpenses().some(e => e.id === expense.id)) return null;
                patchState(store, { rawExpenses: [...store.rawExpenses(), expense] });
                const key = store.encryptionKey();
                if (!key) return null;
                const decrypted = await decryptExpense(expense, key, crypto);
                if (decrypted) {
                    patchState(store, {
                        decryptedExpenses: [...store.decryptedExpenses().filter(e => e.id !== expense.id), decrypted],
                    });
                }
                return decrypted;
            },

            onExpenseVerified(expenseId: string, status: VerificationStatus, verifiedByUserId: string): void {
                const updated = store.rawExpenses().map(e =>
                    e.id === expenseId
                        ? {
                            ...e,
                            status,
                            isArchived: e.isArchived || status === VerificationStatus.Verified,
                            verifications: e.verifications.some(v => v.verifiedByUserId === verifiedByUserId)
                                ? e.verifications
                                : [...e.verifications, { verifiedByUserId, verifiedAt: new Date().toISOString() }],
                        }
                        : e
                );
                patchState(store, { rawExpenses: updated });
                const key = store.encryptionKey();
                if (key) void doDecryptExpenses(updated, key);
            },

            onSettlementCreated(settlement: NemesisSettlementDto): void {
                if (store.rawSettlements().some(s => s.id === settlement.id)) return;
                const updated = [...store.rawSettlements(), settlement];
                patchState(store, { rawSettlements: updated });
                const key = store.encryptionKey();
                if (key) void doDecryptSettlements(updated, key);
            },

            async onSettlementCreatedAsync(settlement: NemesisSettlementDto): Promise<DecryptedSettlement | null> {
                if (store.rawSettlements().some(s => s.id === settlement.id)) return null;
                const updated = [...store.rawSettlements(), settlement];
                patchState(store, { rawSettlements: updated });
                const key = store.encryptionKey();
                if (!key) return null;
                const decrypted = await decryptSettlement(settlement, key, crypto);
                if (decrypted) {
                    patchState(store, {
                        decryptedSettlements: [...store.decryptedSettlements().filter(s => s.id !== settlement.id), decrypted],
                    });
                }
                return decrypted;
            },

            setJustConfirmedDebt(toUserId: string | null): void {
                patchState(store, { justConfirmedDebtToUserId: toUserId });
            },

            setMembers(members: ListMember[]): void {
                patchState(store, { members });
            },

            onSettlementConfirmed(settlementId: string): void {
                const updated = store.rawSettlements().map(s =>
                    s.id === settlementId
                        ? { ...s, isConfirmedByReceiver: true, confirmedAt: new Date().toISOString() }
                        : s
                );
                patchState(store, { rawSettlements: updated });
                const key = store.encryptionKey();
                if (key) void doDecryptSettlements(updated, key);
            },

            onSettlementDeclined(settlementId: string): void {
                const updated = store.rawSettlements().map(s =>
                    s.id === settlementId
                        ? { ...s, status: SettlementStatus.Declined, resolvedAt: new Date().toISOString() }
                        : s
                );
                patchState(store, { rawSettlements: updated });
                const key = store.encryptionKey();
                if (key) void doDecryptSettlements(updated, key);
            },

            onSettlementVoided(settlementId: string): void {
                const updated = store.rawSettlements().map(s =>
                    s.id === settlementId
                        ? { ...s, status: SettlementStatus.Voided, resolvedAt: new Date().toISOString() }
                        : s
                );
                patchState(store, { rawSettlements: updated });
                const key = store.encryptionKey();
                if (key) void doDecryptSettlements(updated, key);
            },

            onSettlementExpired(settlementId: string): void {
                const updated = store.rawSettlements().map(s =>
                    s.id === settlementId
                        ? { ...s, status: SettlementStatus.Expired, resolvedAt: new Date().toISOString() }
                        : s
                );
                patchState(store, { rawSettlements: updated });
                const key = store.encryptionKey();
                if (key) void doDecryptSettlements(updated, key);
            },

            onSettlementForgiven(settlementId: string): void {
                const updated = store.rawSettlements().map(s =>
                    s.id === settlementId
                        ? { ...s, status: SettlementStatus.Forgiven, resolvedAt: new Date().toISOString() }
                        : s
                );
                patchState(store, { rawSettlements: updated });
                const key = store.encryptionKey();
                if (key) void doDecryptSettlements(updated, key);
            },

            async rejectExpense(expenseId: string): Promise<void> {
                await firstValueFrom(api.rejectExpense(expenseId));
                await doLoadData();
            },

            async archiveExpense(expenseId: string): Promise<void> {
                await firstValueFrom(api.archiveExpense(expenseId));
                const updated = store.rawExpenses().filter(e => e.id !== expenseId);
                patchState(store, { rawExpenses: updated });
                const key = store.encryptionKey();
                if (key) void doDecryptExpenses(updated, key);
            },

            async loadArchivedExpenses(reset = false): Promise<void> {
                const listId = store.listId();
                const key = store.encryptionKey();
                if (!listId || !key) return;
                const cursor = reset ? undefined : store.archivedCursor() ?? undefined;
                patchState(store, { archivedLoading: true });
                try {
                    const response = await firstValueFrom(api.getArchivedExpenses(listId, cursor));
                    const raw = reset
                        ? response.expenses
                        : [...store.rawArchivedExpenses(), ...response.expenses];
                    patchState(store, {
                        rawArchivedExpenses: raw,
                        archivedCursor: response.nextCursor,
                        archivedHasMore: response.nextCursor !== null,
                    });
                    await doDecryptArchivedExpenses(raw, key);
                } finally {
                    patchState(store, { archivedLoading: false });
                }
            },

            setShowArchived(show: boolean): void {
                patchState(store, { showArchived: show });
            },

            onExpenseArchived(expenseId: string): void {
                const updated = store.rawExpenses().filter(e => e.id !== expenseId);
                patchState(store, { rawExpenses: updated });
                const key = store.encryptionKey();
                if (key) void doDecryptExpenses(updated, key);
                patchState(store, {
                    rawArchivedExpenses: [],
                    archivedExpenses: [],
                    archivedCursor: null,
                    archivedHasMore: false,
                });
            },
        };
    }),
);

async function decryptExpense(
    dto: NemesisExpenseDto,
    key: string,
    crypto: CryptoService,
): Promise<DecryptedExpense | null> {
    try {
        const json = await crypto.decrypt(dto.encryptedPayload, dto.payloadInitializationVector, key);
        const parsed = JSON.parse(json);
        return {
            id: dto.id,
            ghostListId: dto.ghostListId,
            status: dto.status,
            splitCount: dto.splitCount ?? 0,
            isArchived: dto.isArchived ?? false,
            createdAt: dto.createdAt,
            createdByUserId: dto.createdByUserId,
            verifications: dto.verifications,
            amount: parsed.amount,
            currency: parsed.currency,
            description: parsed.description,
            paidByUserId: parsed.paidByUserId,
            splitBetween: parsed.splitBetween,
            hasReceipt: !!dto.receiptBlobKey,
        };
    } catch {
        return null;
    }
}

async function decryptSettlement(
    dto: NemesisSettlementDto,
    key: string,
    crypto: CryptoService,
): Promise<DecryptedSettlement | null> {
    try {
        const json = await crypto.decrypt(dto.encryptedPayload, dto.payloadInitializationVector, key);
        const parsed = JSON.parse(json);
        return {
            id: dto.id,
            ghostListId: dto.ghostListId,
            fromUserId: parsed.fromUserId ?? null,
            toUserId: parsed.toUserId ?? null,
            amount: parsed.amount,
            currency: parsed.currency,
            isPaidByPayer: dto.isPaidByPayer,
            isConfirmedByReceiver: dto.isConfirmedByReceiver,
            paidAt: dto.paidAt,
            confirmedAt: dto.confirmedAt,
            payerUserId: dto.payerUserId ?? null,
            receiverUserId: dto.receiverUserId ?? null,
            status: dto.status ?? SettlementStatus.Pending,
            resolvedAt: dto.resolvedAt ?? null,
        };
    } catch {
        return null;
    }
}

function computeNetDebts(
    expenses: DecryptedExpense[],
    settlements: DecryptedSettlement[],
): DebtEntry[] {
    const balances = new Map<string, Map<string, number>>();

    const addDebt = (from: string, to: string, amount: number, currency: string) => {
        if (from === to || amount <= 0) return;
        const key = `${currency}`;
        if (!balances.has(key)) balances.set(key, new Map());
        const currencyMap = balances.get(key)!;
        const pairKey = [from, to].sort().join('→');
        const existing = currencyMap.get(pairKey) ?? 0;
        const signed = from < to ? amount : -amount;
        currencyMap.set(pairKey, existing + signed);
    };

    for (const expense of expenses.filter(e => e.status === VerificationStatus.Verified)) {
        const share = expense.amount / expense.splitBetween.length;
        for (const userId of expense.splitBetween) {
            if (userId !== expense.paidByUserId) {
                addDebt(userId, expense.paidByUserId, share, expense.currency);
            }
        }
    }

    for (const settlement of settlements.filter(s => s.status === SettlementStatus.Confirmed)) {
        addDebt(settlement.toUserId, settlement.fromUserId, settlement.amount, settlement.currency);
    }

    const result: DebtEntry[] = [];
    for (const [currency, currencyMap] of balances) {
        for (const [pairKey, net] of currencyMap) {
            if (Math.abs(net) < 0.01) continue;
            const [a, b] = pairKey.split('→');
            result.push(net > 0
                ? { fromUserId: a, toUserId: b, amount: Math.round(net * 100) / 100, currency }
                : { fromUserId: b, toUserId: a, amount: Math.round(-net * 100) / 100, currency }
            );
        }
    }

    return result;
}

function minimizeDebts(debts: DebtEntry[]): DebtEntry[] {
    const currencies = [...new Set(debts.map(d => d.currency))];
    const result: DebtEntry[] = [];

    for (const currency of currencies) {
        const currencyDebts = debts.filter(d => d.currency === currency);
        const netBalance = new Map<string, number>();

        for (const debt of currencyDebts) {
            netBalance.set(debt.fromUserId, (netBalance.get(debt.fromUserId) ?? 0) - debt.amount);
            netBalance.set(debt.toUserId, (netBalance.get(debt.toUserId) ?? 0) + debt.amount);
        }

        const creditors: { userId: string; amount: number }[] = [];
        const debtors: { userId: string; amount: number }[] = [];

        for (const [userId, balance] of netBalance) {
            if (balance > 0.005) creditors.push({ userId, amount: balance });
            else if (balance < -0.005) debtors.push({ userId, amount: -balance });
        }

        creditors.sort((a, b) => b.amount - a.amount);
        debtors.sort((a, b) => b.amount - a.amount);

        let ci = 0;
        let di = 0;

        while (ci < creditors.length && di < debtors.length) {
            const creditor = creditors[ci];
            const debtor = debtors[di];
            const settle = Math.min(creditor.amount, debtor.amount);

            result.push({
                fromUserId: debtor.userId,
                toUserId: creditor.userId,
                amount: Math.round(settle * 100) / 100,
                currency,
            });

            creditor.amount -= settle;
            debtor.amount -= settle;

            if (creditor.amount < 0.005) ci++;
            if (debtor.amount < 0.005) di++;
        }
    }

    return result;
}

async function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}
