export enum InfoMessageType {
    Info = 'Info',
    ReleaseNotes = 'ReleaseNotes',
    Maintenance = 'Maintenance',
}

/** Matches the server's `DevicePlatform` enum (serialized as a string). */
export enum DevicePlatform {
    Ios = 'Ios',
    Android = 'Android',
    Web = 'Web',
}

export interface InfoMessage {
    id: string;
    type: InfoMessageType;
    title: string;
    body: string;
    /** If set, the message is only shown on this platform. Null/undefined = all platforms. */
    targetPlatform: DevicePlatform | null;
    createdAt: string;
}

export interface CreateInfoMessageRequest {
    type: InfoMessageType;
    title: string;
    body: string;
    targetPlatform: DevicePlatform | null;
}
