export enum WhisperLifetime {
    ThreeSeconds = 'ThreeSeconds',
    FiveSeconds = 'FiveSeconds',
    EightSeconds = 'EightSeconds',
    TwelveSeconds = 'TwelveSeconds',
    TwentySeconds = 'TwentySeconds',
}

export const WHISPER_LIFETIME_VALUE_TO_ENUM: Readonly<Record<number, WhisperLifetime>> = {
    3: WhisperLifetime.ThreeSeconds,
    5: WhisperLifetime.FiveSeconds,
    8: WhisperLifetime.EightSeconds,
    12: WhisperLifetime.TwelveSeconds,
    20: WhisperLifetime.TwentySeconds,
};

export const WHISPER_LIFETIME_ENUM_TO_SECONDS: Readonly<Record<WhisperLifetime, number>> = {
    [WhisperLifetime.ThreeSeconds]: 3,
    [WhisperLifetime.FiveSeconds]: 5,
    [WhisperLifetime.EightSeconds]: 8,
    [WhisperLifetime.TwelveSeconds]: 12,
    [WhisperLifetime.TwentySeconds]: 20,
};

export const WHISPER_LIFETIME_LABELS: Readonly<Record<WhisperLifetime, string>> = {
    [WhisperLifetime.ThreeSeconds]: '3 seconds',
    [WhisperLifetime.FiveSeconds]: '5 seconds',
    [WhisperLifetime.EightSeconds]: '8 seconds',
    [WhisperLifetime.TwelveSeconds]: '12 seconds',
    [WhisperLifetime.TwentySeconds]: '20 seconds',
};
