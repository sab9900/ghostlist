export enum InfoMessageType {
    Info = 'Info',
    ReleaseNotes = 'ReleaseNotes',
    Maintenance = 'Maintenance',
}

export interface InfoMessage {
    id: string;
    type: InfoMessageType;
    title: string;
    body: string;
    createdAt: string;
}

export interface CreateInfoMessageRequest {
    type: InfoMessageType;
    title: string;
    body: string;
}
