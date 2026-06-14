import { inject, Injectable, OnDestroy, signal } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { Subject } from 'rxjs';
import { Capacitor } from '@capacitor/core';
import { environment } from '../../environments/environment';
import {
    CharonDropCreatedEvent,
    ImageSharedEvent,
    ItemCreatedEvent,
    ItemToggledEvent,
    MessageCreatedEvent,
    ReadReceiptUpdatedEvent,
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
    private readonly _listDeleted$ = new Subject<string>();
    private readonly _memberKicked$ = new Subject<{ listId: string; deviceId: string }>();
    private readonly _memberJoined$ = new Subject<{ listId: string; deviceId: string }>();
    private readonly _imageShared$ = new Subject<ImageSharedEvent>();
    private readonly _readReceiptUpdated$ = new Subject<ReadReceiptUpdatedEvent>();
    private readonly _whisperReceived$ = new Subject<WhisperReceivedEvent>();
    private readonly _whisperPresenceChanged$ = new Subject<{ listId: string; roster: WhisperPresenceEntry[] }>();
    private readonly _charonDropCreated$ = new Subject<CharonDropCreatedEvent>();
    private readonly _charonDropDeleted$ = new Subject<string>();
    private readonly _reconnected$ = new Subject<void>();

    readonly itemCreated$ = this._itemCreated$.asObservable();
    readonly itemToggled$ = this._itemToggled$.asObservable();
    readonly itemDeleted$ = this._itemDeleted$.asObservable();
    readonly messageReceived$ = this._messageReceived$.asObservable();
    readonly messageDeleted$ = this._messageDeleted$.asObservable();
    readonly ttlUpdated$ = this._ttlUpdated$.asObservable();
    readonly listDeleted$ = this._listDeleted$.asObservable();
    readonly memberKicked$ = this._memberKicked$.asObservable();
    readonly memberJoined$ = this._memberJoined$.asObservable();
    readonly imageShared$ = this._imageShared$.asObservable();
    readonly readReceiptUpdated$ = this._readReceiptUpdated$.asObservable();
    readonly whisperReceived$ = this._whisperReceived$.asObservable();
    readonly whisperPresenceChanged$ = this._whisperPresenceChanged$.asObservable();
    readonly charonDropCreated$ = this._charonDropCreated$.asObservable();
    readonly charonDropDeleted$ = this._charonDropDeleted$.asObservable();

    readonly reconnected$ = this._reconnected$.asObservable();

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

    async connect(): Promise<void> {
        if (this.connection.state !== signalR.HubConnectionState.Disconnected) return;
        await this.connection.start();
        this.connectionState.set(signalR.HubConnectionState.Connected);
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

    /** Reports app-wide foreground/background status, used to suppress push notifications while the app is open. */
    async setAppState(isForeground: boolean): Promise<void> {
        if (this.connection.state !== signalR.HubConnectionState.Connected) return;
        await this.connection.invoke('SetAppState', this.deviceId.deviceId, isForeground);
    }

    async relayImage(listId: string, messageId: string, encryptedImage: string, imageInitializationVector: string): Promise<void> {
        await this.connection.invoke('RelayImage', listId, messageId, encryptedImage, imageInitializationVector);
    }

    /** Joins the ephemeral Whisper room for a list, reporting a plaintext display name for the live presence roster. */
    async joinWhisperRoom(listId: string, displayName: string): Promise<void> {
        await this.connection.invoke('JoinWhisperRoom', listId, this.deviceId.deviceId, displayName);
    }

    async leaveWhisperRoom(listId: string): Promise<void> {
        if (this.connection.state !== signalR.HubConnectionState.Connected) return;
        await this.connection.invoke('LeaveWhisperRoom', listId);
    }

    /** Sends a live, never-persisted "whisper" to everyone else currently viewing the Whisper tab. */
    async sendWhisper(listId: string, ciphertext: string, iv: string, senderCiphertext: string, senderIv: string): Promise<void> {
        await this.connection.invoke('SendWhisper', listId, ciphertext, iv, senderCiphertext, senderIv);
    }

    ngOnDestroy(): void {
        this.connection.stop();
    }
}
