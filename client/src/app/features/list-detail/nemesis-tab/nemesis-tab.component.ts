import { Component, OnDestroy, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet, Router, ActivatedRoute } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter, mergeMap } from 'rxjs';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { HubService } from '../../../api/hub.service';
import { TabTransitionDirective } from '../../../core/directives/tab-transition.directive';
import { LayoutService } from '../../../core/services/layout.service';
import { NemesisBadgeService } from '../../../core/services/nemesis-badge.service';
import { SnackService } from '../../../core/services/snack.service';
import { UserIdService } from '../../../core/services/user-id.service';
import { NemesisStore } from '../../../store/nemesis/nemesis.store';
import { AppStore } from '../../../store/app.store';
import { NemesisExpensesPanelComponent } from '../../nemesis/nemesis-expenses-panel/nemesis-expenses-panel.component';
import { NemesisSettlementsPanelComponent } from '../../nemesis/nemesis-settlements-panel/nemesis-settlements-panel.component';
import { DecryptedSettlement, SettlementStatus, VerificationStatus } from '../../../core/models/nemesis.model';

type NemesisPanel = 'expenses' | 'settlements';

@Component({
    selector: 'app-nemesis-tab',
    standalone: true,
    imports: [RouterLink, RouterLinkActive, RouterOutlet, TranslatePipe, TabTransitionDirective, NemesisExpensesPanelComponent, NemesisSettlementsPanelComponent],
    providers: [NemesisStore],
    templateUrl: './nemesis-tab.component.html',
    styleUrls: ['./nemesis-tab.component.scss'],
})
export class NemesisTabComponent implements OnInit, OnDestroy {
    private readonly appStore = inject(AppStore);
    private readonly hub = inject(HubService);
    private readonly badge = inject(NemesisBadgeService);
    private readonly snack = inject(SnackService);
    private readonly translate = inject(TranslateService);
    private readonly userIdService = inject(UserIdService);
    private readonly router = inject(Router);
    private readonly route = inject(ActivatedRoute);
    protected readonly layout = inject(LayoutService);
    readonly nemesisStore = inject(NemesisStore);

    protected readonly activePanel = signal<NemesisPanel>('expenses');

    get listId(): string {
        return this.appStore.currentListId() ?? '';
    }

    private readonly pendingForMe = computed(() => {
        const userId = this.userIdService.userId();
        const pendingExpenses = this.nemesisStore.decryptedExpenses().filter(e =>
            e.status === VerificationStatus.Pending &&
            e.splitBetween.includes(userId) &&
            e.paidByUserId !== userId &&
            !e.verifications.some(v => v.verifiedByUserId === userId)
        ).length;
        const pendingSettlements = this.nemesisStore.decryptedSettlements().filter((s: DecryptedSettlement) => {
            if (s.status !== SettlementStatus.Pending) return false;
            if (s.toUserId) return s.toUserId === userId;
            return s.payerUserId !== null && s.payerUserId !== userId;
        }).length;
        return pendingExpenses + pendingSettlements;
    });

    constructor() {
        this.hub.nemesisExpenseCreated$.pipe(
            takeUntilDestroyed(),
            filter(e => e.ghostListId === this.listId),
            mergeMap(async e => {
                const decrypted = await this.nemesisStore.onExpenseCreated({
                    id: e.id,
                    ghostListId: e.ghostListId,
                    encryptedPayload: e.encryptedPayload,
                    payloadInitializationVector: e.payloadInitializationVector,
                    status: e.status as VerificationStatus,
                    splitCount: e.splitCount,
                    isArchived: false,
                    createdAt: e.createdAt,
                    createdByDeviceId: e.createdByDeviceId,
                    createdByUserId: e.createdByUserId,
                    encryptedReceiptKey: e.encryptedReceiptKey,
                    receiptBlobKey: e.receiptBlobKey,
                    verifications: e.verifications ?? [],
                });
                return { e, decrypted };
            }),
        ).subscribe(({ e, decrypted }) => {
            const userId = this.userIdService.userId();
            if (e.createdByUserId !== userId && decrypted?.splitBetween.includes(userId)) {
                this.snack.show({
                    iconKind: 'nemesis',
                    text: this.translate.instant('NEMESIS.SNACK_EXPENSE_CREATED'),
                    autoDismissMs: 4000,
                });
            }
        });

        this.hub.nemesisExpenseVerified$.pipe(
            takeUntilDestroyed(),
            filter(e => e.ghostListId === this.listId),
        ).subscribe(e => {
            const userId = this.userIdService.userId();
            const expense = this.nemesisStore.decryptedExpenses().find(ex => ex.id === e.expenseId);
            const isPayer = expense?.paidByUserId === userId;
            this.nemesisStore.onExpenseVerified(e.expenseId, e.status as VerificationStatus, e.verifiedByUserId);
            if (isPayer && e.verifiedByUserId !== userId) {
                this.snack.show({
                    iconKind: 'nemesis',
                    text: this.translate.instant('NEMESIS.SNACK_EXPENSE_VERIFIED'),
                    autoDismissMs: 4000,
                });
            }
        });

        this.hub.nemesisSettlementCreated$.pipe(
            takeUntilDestroyed(),
            filter(e => e.ghostListId === this.listId),
            mergeMap(async e => {
                const now = new Date().toISOString();
                const decrypted = await this.nemesisStore.onSettlementCreatedAsync({
                    id: e.id,
                    ghostListId: e.ghostListId,
                    encryptedPayload: e.encryptedPayload,
                    payloadInitializationVector: e.payloadInitializationVector,
                    isPaidByPayer: e.isPaidByPayer,
                    isConfirmedByReceiver: e.isConfirmedByReceiver,
                    paidAt: e.paidAt,
                    confirmedAt: e.isConfirmedByReceiver ? now : null,
                    payerDeviceId: e.payerDeviceId,
                    payerUserId: e.payerUserId,
                    receiverUserId: e.receiverUserId ?? null,
                    status: e.isConfirmedByReceiver ? SettlementStatus.Confirmed : SettlementStatus.Pending,
                    resolvedAt: e.isConfirmedByReceiver ? now : null,
                    createdAt: now,
                });
                return { e, decrypted };
            }),
        ).subscribe(({ e, decrypted }) => {
            const userId = this.userIdService.userId();
            if (e.isConfirmedByReceiver) {
                if (e.payerUserId === userId) {
                    if (decrypted?.toUserId) this.nemesisStore.setJustConfirmedDebt(decrypted.toUserId);
                    this.goToSettlements();
                    this.snack.show({
                        iconKind: 'nemesis',
                        text: this.translate.instant('NEMESIS.SNACK_SETTLEMENT_CONFIRMED'),
                        autoDismissMs: 5000,
                    });
                }
                return;
            }
            if (e.payerUserId !== userId && decrypted?.toUserId === userId) {
                this.snack.show({
                    iconKind: 'nemesis',
                    text: this.translate.instant('NEMESIS.SNACK_SETTLEMENT_CREATED'),
                    autoDismissMs: 4000,
                });
            }
        });

        this.hub.nemesisSettlementConfirmed$.pipe(
            takeUntilDestroyed(),
            filter(e => e.ghostListId === this.listId),
        ).subscribe(e => {
            const userId = this.userIdService.userId();
            const raw = this.nemesisStore.rawSettlements().find(s => s.id === e.settlementId);
            const decrypted = this.nemesisStore.decryptedSettlements().find(s => s.id === e.settlementId);
            this.nemesisStore.onSettlementConfirmed(e.settlementId);
            if (raw?.payerUserId === userId && decrypted?.toUserId) {
                this.nemesisStore.setJustConfirmedDebt(decrypted.toUserId);
                this.goToSettlements();
                this.snack.show({
                    iconKind: 'nemesis',
                    text: this.translate.instant('NEMESIS.SNACK_SETTLEMENT_CONFIRMED'),
                    autoDismissMs: 5000,
                });
            }
        });

        this.hub.nemesisSettlementDeclined$.pipe(
            takeUntilDestroyed(),
            filter(e => e.ghostListId === this.listId),
        ).subscribe(e => {
            const userId = this.userIdService.userId();
            const raw = this.nemesisStore.rawSettlements().find(s => s.id === e.settlementId);
            this.nemesisStore.onSettlementDeclined(e.settlementId);
            if (raw?.payerUserId === userId) {
                this.snack.show({
                    iconKind: 'nemesis',
                    text: this.translate.instant('NEMESIS.SNACK_SETTLEMENT_DECLINED'),
                    autoDismissMs: 4000,
                });
            }
        });

        this.hub.nemesisExpenseArchived$.pipe(
            takeUntilDestroyed(),
            filter(e => e.ghostListId === this.listId),
        ).subscribe(e => {
            this.nemesisStore.onExpenseArchived(e.expenseId);
        });

        this.hub.nemesisExpenseUpdated$.pipe(
            takeUntilDestroyed(),
            filter(e => e.ghostListId === this.listId),
        ).subscribe(e => {
            void this.nemesisStore.onExpenseUpdated({
                id: e.id,
                ghostListId: e.ghostListId,
                encryptedPayload: e.encryptedPayload,
                payloadInitializationVector: e.payloadInitializationVector,
                status: e.status as VerificationStatus,
                splitCount: e.splitCount,
                isArchived: e.isArchived,
                createdAt: e.createdAt,
                createdByDeviceId: e.createdByDeviceId,
                createdByUserId: e.createdByUserId,
                encryptedReceiptKey: e.encryptedReceiptKey,
                receiptBlobKey: e.receiptBlobKey,
                verifications: e.verifications ?? [],
            });
        });

        this.hub.nemesisExpenseDeleted$.pipe(
            takeUntilDestroyed(),
            filter(e => e.ghostListId === this.listId),
        ).subscribe(e => {
            this.nemesisStore.onExpenseDeleted(e.expenseId);
        });

        this.hub.memberKicked$.pipe(
            takeUntilDestroyed(),
            filter(({ listId }) => listId === this.listId),
        ).subscribe(() => void this.reconcileAfterMembershipChange());

        this.hub.memberJoined$.pipe(
            takeUntilDestroyed(),
            filter(({ listId }) => listId === this.listId),
        ).subscribe(() => void this.loadMembers());

        this.hub.nemesisSettlementVoided$.pipe(
            takeUntilDestroyed(),
            filter(e => e.ghostListId === this.listId),
        ).subscribe(e => {
            this.nemesisStore.onSettlementVoided(e.settlementId);
        });

        this.hub.nemesisSettlementExpired$.pipe(
            takeUntilDestroyed(),
            filter(e => e.ghostListId === this.listId),
        ).subscribe(e => {
            this.nemesisStore.onSettlementExpired(e.settlementId);
            this.snack.show({
                iconKind: 'nemesis',
                text: this.translate.instant('NEMESIS.SNACK_SETTLEMENT_EXPIRED'),
                autoDismissMs: 5000,
            });
        });

        this.hub.nemesisSettlementForgiven$.pipe(
            takeUntilDestroyed(),
            filter(e => e.ghostListId === this.listId),
        ).subscribe(e => {
            this.nemesisStore.onSettlementForgiven(e.settlementId);
            this.snack.show({
                iconKind: 'nemesis',
                text: this.translate.instant('NEMESIS.SNACK_SETTLEMENT_FORGIVEN'),
                autoDismissMs: 5000,
            });
        });

        this.hub.nemesisSettlementExpiring$.pipe(
            takeUntilDestroyed(),
            filter(e => e.ghostListId === this.listId),
        ).subscribe(e => {
            this.snack.show({
                iconKind: 'nemesis',
                text: this.translate.instant('NEMESIS.SNACK_SETTLEMENT_EXPIRING', { days: e.daysLeft }),
                autoDismissMs: 6000,
            });
        });

        this.hub.nemesisLedgerPurged$.pipe(
            takeUntilDestroyed(),
            filter(e => e.ghostListId === this.listId),
        ).subscribe(() => {
            this.nemesisStore.onLedgerPurged();
        });

        this.hub.reconnected$.pipe(takeUntilDestroyed()).subscribe(() => {
            void this.nemesisStore.loadData();
        });

        effect(() => {
            const count = this.pendingForMe();
            untracked(() => this.badge.set(count));
        });

        effect(() => {
            const listId = this.appStore.currentListId();
            const key = this.appStore.currentEncryptionKey();
            if (!listId || !key) return;
            untracked(() => {
                this.nemesisStore.initialize(listId, key);
                void this.nemesisStore.loadData();
                void this.loadMembers();
                this.badge.clear();
            });
        });
    }

    ngOnInit(): void {
        this.badge.clear();
    }

    ngOnDestroy(): void {
        this.badge.clear();
    }

    protected selectPanel(panel: NemesisPanel): void {
        this.activePanel.set(panel);
    }

    private goToSettlements(): void {
        if (this.layout.isDesktop()) {
            this.activePanel.set('settlements');
        } else {
            void this.router.navigate(['settlements'], { relativeTo: this.route });
        }
    }

    private async loadMembers(): Promise<void> {
        try {
            const key = this.appStore.currentEncryptionKey() ?? '';
            const members = await this.appStore.fetchMembersForList(this.listId, key);
            members.sort((a, b) => {
                if (a.isCurrentUser) return -1;
                if (b.isCurrentUser) return 1;
                return a.displayName.localeCompare(b.displayName);
            });
            this.nemesisStore.setMembers(members);
        } catch { }
    }

    private async reconcileAfterMembershipChange(): Promise<void> {
        await this.loadMembers();
        const trusted = this.appStore.peekMembersComplete(this.listId);
        await this.nemesisStore.reconcileMembership(trusted);
    }
}
