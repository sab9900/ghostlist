import { inject, Injectable, OnDestroy, signal } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { Subject } from 'rxjs';
import { Capacitor } from '@capacitor/core';
import { environment } from '../../environments/environment';
import {
    AudioSharedEvent,
    CharonDropCreatedEvent,
    ImageSharedEvent,
    ItemCreatedEvent,
    ItemPriorityChangedEvent,
    ItemToggledEvent,
    ListReminderFiredEvent,
    MessageCreatedEvent,
    NemesisExpenseArchivedEvent,
    NemesisExpenseCreatedEvent,
    NemesisExpenseDeletedEvent,
    NemesisExpenseUpdatedEvent,
    NemesisExpenseVerifiedEvent,
    NemesisSettlementConfirmedEvent,
    NemesisSettlementCreatedEvent,
    NemesisSettlementDeclinedEvent,
    NemesisSettlementVoidedEvent,
    NemesisSettlementExpiredEvent,
    NemesisSettlementForgivenEvent,
    NemesisSettlementExpiringEvent,
    NemesisLedgerPurgedEvent,
    ReactionChangedEvent,
    ReadReceiptUpdatedEvent,
    ReminderFiredEvent,
    TypingIndicatorEvent,
    VideoSharedEvent,
    WhisperInviteReceivedEvent,
    WhisperPresenceEntry,
    WhisperReceivedEvent,
} from '../core/models';
import { DeviceIdService } from '../core/services/device-id.service';

@Injectable({ providedIn: 'root' })
export class HubService implements OnDestroy {
    private readonly deviceId = inject(DeviceIdService);

    readonly connectionState = signal<signalR.HubConnectionState>(
        signalR.HubConnectionState.Disconnected,
    );

    private readonly _itemCreated$ = new Subject<ItemCreatedEvent>();
    private readonly _itemToggled$ = new Subject<ItemToggledEvent>();
    private readonly _itemDeleted$ = new Subject<string>();
    private readonly _messageReceived$ = new Subject<MessageCreatedEvent>();
    private readonly _messageDeleted$ = new Subject<string>();
    private readonly _ttlUpdated$ = new Subject<number>();
    private readonly _whisperLifetimeUpdated$ = new Subject<number>();
    private readonly _listDeleted$ = new Subject<string>();
    private readonly _memberKicked$ = new Subject<{ listId: string; deviceId: string }>();
    private readonly _memberJoined$ = new Subject<{ listId: string; deviceId: string }>();
    private readonly _imageShared$ = new Subject<ImageSharedEvent>();
    private readonly _readReceiptUpdated$ = new Subject<ReadReceiptUpdatedEvent>();
    private readonly _whisperReceived$ = new Subject<WhisperReceivedEvent>();
    private readonly _whisperPresenceChanged$ = new Subject<{ listId: string; roster: WhisperPresenceEntry[] }>();
    private readonly _charonDropCreated$ = new Subject<CharonDropCreatedEvent>();
    private readonly _charonDropDeleted$ = new Subject<string>();
    private readonly _charonDropViewed$ = new Subject<{ dropId: string; viewerIdentity: string }>();
    private readonly _audioShared$ = new Subject<AudioSharedEvent>();
    private readonly _videoShared$ = new Subject<VideoSharedEvent>();
    private readonly _reminderFired$ = new Subject<ReminderFiredEvent>();
    private readonly _listReminderFired$ = new Subject<ListReminderFiredEvent>();
    private readonly _typingIndicator$ = new Subject<TypingIndicatorEvent>();
    private readonly _whisperInviteReceived$ = new Subject<WhisperInviteReceivedEvent>();
    private readonly _reconnected$ = new Subject<void>();
    private readonly _nemesisExpenseCreated$ = new Subject<NemesisExpenseCreatedEvent>();
    private readonly _nemesisExpenseVerified$ = new Subject<NemesisExpenseVerifiedEvent>();
    private readonly _nemesisSettlementCreated$ = new Subject<NemesisSettlementCreatedEvent>();
    private readonly _nemesisSettlementConfirmed$ = new Subject<NemesisSettlementConfirmedEvent>();
    private readonly _nemesisSettlementDeclined$ = new Subject<NemesisSettlementDeclinedEvent>();
    private readonly _nemesisSettlementVoided$ = new Subject<NemesisSettlementVoidedEvent>();
    private readonly _nemesisSettlementExpired$ = new Subject<NemesisSettlementExpiredEvent>();
    private readonly _nemesisSettlementForgiven$ = new Subject<NemesisSettlementForgivenEvent>();
    private readonly _nemesisSettlementExpiring$ = new Subject<NemesisSettlementExpiringEvent>();
    private readonly _nemesisLedgerPurged$ = new Subject<NemesisLedgerPurgedEvent>();
    private readonly _nemesisExpenseArchived$ = new Subject<NemesisExpenseArchivedEvent>();
    private readonly _nemesisExpenseUpdated$ = new Subject<NemesisExpenseUpdatedEvent>();
    private readonly _nemesisExpenseDeleted$ = new Subject<NemesisExpenseDeletedEvent>();
    private readonly _itemPriorityChanged$ = new Subject<ItemPriorityChangedEvent>();
    private readonly _reactionChanged$ = new Subject<ReactionChangedEvent>();

    readonly itemCreated$ = this._itemCreated$.asObservable();
    readonly itemToggled$ = this._itemToggled$.asObservable();
    readonly itemDeleted$ = this._itemDeleted$.asObservable();
    readonly messageReceived$ = this._messageReceived$.asObservable();
    readonly messageDeleted$ = this._messageDeleted$.asObservable();
    readonly ttlUpdated$ = this._ttlUpdated$.asObservable();
    readonly whisperLifetimeUpdated$ = this._whisperLifetimeUpdated$.asObservable();
    readonly listDeleted$ = this._listDeleted$.asObservable();
    readonly memberKicked$ = this._memberKicked$.asObservable();
    readonly memberJoined$ = this._memberJoined$.asObservable();
    readonly imageShared$ = this._imageShared$.asObservable();
    readonly readReceiptUpdated$ = this._readReceiptUpdated$.asObservable();
    readonly whisperReceived$ = this._whisperReceived$.asObservable();
    readonly whisperPresenceChanged$ = this._whisperPresenceChanged$.asObservable();
    readonly charonDropCreated$ = this._charonDropCreated$.asObservable();
    readonly charonDropDeleted$ = this._charonDropDeleted$.asObservable();
    readonly charonDropViewed$ = this._charonDropViewed$.asObservable();
    readonly audioShared$ = this._audioShared$.asObservable();
    readonly videoShared$ = this._videoShared$.asObservable();
    readonly reminderFired$ = this._reminderFired$.asObservable();
    readonly listReminderFired$ = this._listReminderFired$.asObservable();

    readonly typingIndicator$ = this._typingIndicator$.asObservable();
    readonly whisperInviteReceived$ = this._whisperInviteReceived$.asObservable();
    readonly reconnected$ = this._reconnected$.asObservable();
    readonly nemesisExpenseCreated$ = this._nemesisExpenseCreated$.asObservable();
    readonly nemesisExpenseVerified$ = this._nemesisExpenseVerified$.asObservable();
    readonly nemesisSettlementCreated$ = this._nemesisSettlementCreated$.asObservable();
    readonly nemesisSettlementConfirmed$ = this._nemesisSettlementConfirmed$.asObservable();
    readonly nemesisSettlementDeclined$ = this._nemesisSettlementDeclined$.asObservable();
    readonly nemesisSettlementVoided$ = this._nemesisSettlementVoided$.asObservable();
    readonly nemesisSettlementExpired$ = this._nemesisSettlementExpired$.asObservable();
    readonly nemesisSettlementForgiven$ = this._nemesisSettlementForgiven$.asObservable();
    readonly nemesisSettlementExpiring$ = this._nemesisSettlementExpiring$.asObservable();
    readonly nemesisLedgerPurged$ = this._nemesisLedgerPurged$.asObservable();
    readonly nemesisExpenseArchived$ = this._nemesisExpenseArchived$.asObservable();
    readonly nemesisExpenseUpdated$ = this._nemesisExpenseUpdated$.asObservable();
    readonly nemesisExpenseDeleted$ = this._nemesisExpenseDeleted$.asObservable();
    readonly itemPriorityChanged$ = this._itemPriorityChanged$.asObservable();
    readonly reactionChanged$ = this._reactionChanged$.asObservable();

    private readonly connection = new signalR.HubConnectionBuilder()
        .withUrl(Capacitor.isNativePlatform() ? environment.nativeHubUrl : environment.hubUrl)
        .withAutomaticReconnect()
        .build();

    constructor() {
        this.connection.on('ItemCreated', (e: ItemCreatedEvent) => this._itemCreated$.next(e));
        this.connection.on('ItemToggled', (e: ItemToggledEvent) => this._itemToggled$.next(e));
        this.connection.on('ItemDeleted', (id: string) => this._itemDeleted$.next(id));
        this.connection.on('MessageReceived', (e: MessageCreatedEvent) => this._messageReceived$.next(e));
        this.connection.on('MessageDeleted', (id: string) => this._messageDeleted$.next(id));
        this.connection.on('TtlUpdated', (ttl: number) => this._ttlUpdated$.next(ttl));
        this.connection.on('WhisperLifetimeUpdated', (lifetime: number) => this._whisperLifetimeUpdated$.next(lifetime));
        this.connection.on('ListDeleted', (id: string) => this._listDeleted$.next(id));
        this.connection.on('MemberKicked', (listId: string, deviceId: string) => this._memberKicked$.next({ listId, deviceId }));
        this.connection.on('MemberJoined', (listId: string, deviceId: string) => this._memberJoined$.next({ listId, deviceId }));
        this.connection.on('ImageShared', (e: ImageSharedEvent) => this._imageShared$.next(e));
        this.connection.on('ReadReceiptUpdated', (e: ReadReceiptUpdatedEvent) => this._readReceiptUpdated$.next(e));
        this.connection.on('WhisperReceived', (e: WhisperReceivedEvent) => this._whisperReceived$.next(e));
        this.connection.on('WhisperPresenceChanged', (listId: string, roster: WhisperPresenceEntry[]) =>
            this._whisperPresenceChanged$.next({ listId, roster }),
        );
        this.connection.on('CharonDropCreated', (e: CharonDropCreatedEvent) => this._charonDropCreated$.next(e));
        this.connection.on('CharonDropDeleted', (id: string) => this._charonDropDeleted$.next(id));
        this.connection.on('CharonDropViewed', (e: { dropId: string; viewerIdentity: string }) => this._charonDropViewed$.next(e));
        this.connection.on('AudioShared', (e: AudioSharedEvent) => this._audioShared$.next(e));
        this.connection.on('VideoShared', (e: VideoSharedEvent) => this._videoShared$.next(e));
        this.connection.on('ReminderFired', (e: ReminderFiredEvent) => this._reminderFired$.next(e));
        this.connection.on('ListReminderFired', (e: ListReminderFiredEvent) => this._listReminderFired$.next(e));
        this.connection.on('TypingIndicator', (listId: string, encryptedName: string, nameIv: string) =>
            this._typingIndicator$.next({ listId, encryptedName, nameIv }),
        );
        this.connection.on('WhisperInviteReceived', (e: WhisperInviteReceivedEvent) => this._whisperInviteReceived$.next(e));
        this.connection.on('NemesisExpenseCreated', (e: NemesisExpenseCreatedEvent) => this._nemesisExpenseCreated$.next(e));
        this.connection.on('NemesisExpenseVerified', (e: NemesisExpenseVerifiedEvent) => this._nemesisExpenseVerified$.next(e));
        this.connection.on('NemesisSettlementCreated', (e: NemesisSettlementCreatedEvent) => this._nemesisSettlementCreated$.next(e));
        this.connection.on('NemesisSettlementConfirmed', (e: NemesisSettlementConfirmedEvent) => this._nemesisSettlementConfirmed$.next(e));
        this.connection.on('NemesisSettlementDeclined', (e: NemesisSettlementDeclinedEvent) => this._nemesisSettlementDeclined$.next(e));
        this.connection.on('NemesisSettlementVoided', (e: NemesisSettlementVoidedEvent) => this._nemesisSettlementVoided$.next(e));
        this.connection.on('NemesisSettlementExpired', (e: NemesisSettlementExpiredEvent) => this._nemesisSettlementExpired$.next(e));
        this.connection.on('NemesisSettlementForgiven', (e: NemesisSettlementForgivenEvent) => this._nemesisSettlementForgiven$.next(e));
        this.connection.on('NemesisSettlementExpiring', (e: NemesisSettlementExpiringEvent) => this._nemesisSettlementExpiring$.next(e));
        this.connection.on('NemesisLedgerPurged', (e: NemesisLedgerPurgedEvent) => this._nemesisLedgerPurged$.next(e));
        this.connection.on('NemesisExpenseArchived', (e: NemesisExpenseArchivedEvent) => this._nemesisExpenseArchived$.next(e));
        this.connection.on('NemesisExpenseUpdated', (e: NemesisExpenseUpdatedEvent) => this._nemesisExpenseUpdated$.next(e));
        this.connection.on('NemesisExpenseDeleted', (e: NemesisExpenseDeletedEvent) => this._nemesisExpenseDeleted$.next(e));
        this.connection.on('ItemPriorityChanged', (e: ItemPriorityChangedEvent) => this._itemPriorityChanged$.next(e));
        this.connection.on('ReactionChanged', (e: ReactionChangedEvent) => this._reactionChanged$.next(e));

        this.connection.onreconnecting(() =>
            this.connectionState.set(signalR.HubConnectionState.Reconnecting),
        );
        this.connection.onreconnected(() => {
            this.connectionState.set(signalR.HubConnectionState.Connected);

            this._reconnected$.next();
        });
        this.connection.onclose(() =>
            this.connectionState.set(signalR.HubConnectionState.Disconnected),
        );
    }

    private connectPromise: Promise<void> | null = null;

    async connect(): Promise<void> {
        if (this.connection.state === signalR.HubConnectionState.Connected) return;

        if (this.connection.state === signalR.HubConnectionState.Disconnected && !this.connectPromise) {
            this.connectPromise = this.connection.start()
                .then(() => this.connectionState.set(signalR.HubConnectionState.Connected))
                .finally(() => {
                    this.connectPromise = null;
                });
        }

        if (this.connectPromise) await this.connectPromise;
    }

    async disconnect(): Promise<void> {
        await this.connection.stop();
    }

    async joinList(listId: string): Promise<void> {
        await this.connection.invoke('JoinListRoom', listId, this.deviceId.deviceId);
    }

    async leaveList(listId: string): Promise<void> {
        await this.connection.invoke('LeaveListRoom', listId);
    }

    async setAppState(isForeground: boolean): Promise<void> {
        if (this.connection.state !== signalR.HubConnectionState.Connected) return;
        await this.connection.invoke('SetAppState', this.deviceId.deviceId, isForeground);
    }

    async relayImage(listId: string, messageId: string, encryptedImage: string, imageInitializationVector: string): Promise<void> {
        await this.connection.invoke('RelayImage', listId, messageId, encryptedImage, imageInitializationVector);
    }

    async relayAudio(listId: string, messageId: string, encryptedAudio: string, audioInitializationVector: string): Promise<void> {
        await this.connection.invoke('RelayAudio', listId, messageId, encryptedAudio, audioInitializationVector);
    }

    async relayVideo(listId: string, messageId: string, encryptedVideo: string, videoInitializationVector: string): Promise<void> {
        await this.connection.invoke('RelayVideo', listId, messageId, encryptedVideo, videoInitializationVector);
    }

    async joinWhisperRoom(listId: string, displayName: string): Promise<void> {
        await this.connect();
        await this.connection.invoke('JoinWhisperRoom', listId, this.deviceId.deviceId, displayName);
    }

    async leaveWhisperRoom(listId: string): Promise<void> {
        if (this.connection.state !== signalR.HubConnectionState.Connected) return;
        await this.connection.invoke('LeaveWhisperRoom', listId);
    }

    async notifyTyping(listId: string, encryptedName: string, nameIv: string): Promise<void> {
        if (this.connection.state !== signalR.HubConnectionState.Connected) return;
        await this.connection.invoke('NotifyTyping', listId, encryptedName, nameIv);
    }

    async sendWhisper(listId: string, ciphertext: string, iv: string, senderCiphertext: string, senderIv: string): Promise<void> {
        await this.connection.invoke('SendWhisper', listId, ciphertext, iv, senderCiphertext, senderIv);
    }

    ngOnDestroy(): void {
        this.connection.stop();
    }
}
