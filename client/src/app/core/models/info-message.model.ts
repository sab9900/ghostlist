/** Category of an admin-authored info message. Matches the server's `InfoMessageType` enum (serialized as a string). */
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

/** A broadcast message authored by an admin (release notes, maintenance windows, ...). */
export interface InfoMessage {
    id: string;
    type: InfoMessageType;
    title: string;
    body: string;
    /** If set, the server only returns this message to matching clients. */
    targetPlatform?: DevicePlatform | null;
    createdAt: string;
}
