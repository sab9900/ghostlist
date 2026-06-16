export enum InfoMessageType {
    Info = 'Info',
    ReleaseNotes = 'ReleaseNotes',
    Maintenance = 'Maintenance',
}

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

    targetPlatform: DevicePlatform | null;
    version?: string | null;
    createdAt: string;
}

export interface CreateInfoMessageRequest {
    type: InfoMessageType;
    title: string;
    body: string;
    targetPlatform: DevicePlatform | null;
}
