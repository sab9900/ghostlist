/** Category of an admin-authored info message. Matches the server's `InfoMessageType` enum (serialized as a string). */
export enum InfoMessageType {
    Info = 'Info',
    ReleaseNotes = 'ReleaseNotes',
    Maintenance = 'Maintenance',
}

/** A broadcast message authored by an admin (release notes, maintenance windows, ...). */
export interface InfoMessage {
    id: string;
    type: InfoMessageType;
    title: string;
    body: string;
    createdAt: string;
}
