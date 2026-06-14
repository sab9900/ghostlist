import { Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { TranslatePipe } from '@ngx-translate/core';
import { environment } from '../../../environments/environment';
import { SyncQrPayload } from '../../core/models';
import { CryptoService } from '../../core/services/crypto.service';
import { LanguageService } from '../../core/services/language.service';
import { LayoutService } from '../../core/services/layout.service';
import { MasterPasswordService } from '../../core/services/master-password.service';
import { SensitiveListsService } from '../../core/services/sensitive-lists.service';
import { Theme, ThemeAccent, ThemeService } from '../../core/services/theme.service';
import { UserPreferencesService } from '../../core/services/user-preferences.service';
import { AUTO_LOCK_OPTIONS, WebAuthnService } from '../../core/services/webauthn.service';
import { AppStore } from '../../store/app.store';
import { QrCodeComponent } from '../../shared/qr-code/qr-code.component';
import { QrScannerComponent } from '../../shared/qr-scanner/qr-scanner.component';
import { SwipeBackDirective } from '../../core/directives/swipe-back.directive';

@Component({
    selector: 'app-settings',
    imports: [TranslatePipe, FormsModule, QrCodeComponent, QrScannerComponent, SwipeBackDirective],
    templateUrl: './settings.component.html',
    styleUrl: './settings.component.scss',
})
export class SettingsComponent {
    protected readonly themeService = inject(ThemeService);
    protected readonly langService = inject(LanguageService);
    protected readonly prefs = inject(UserPreferencesService);
    protected readonly layout = inject(LayoutService);
    protected readonly store = inject(AppStore);
    protected readonly webAuthn = inject(WebAuthnService);
    protected readonly masterPassword = inject(MasterPasswordService);
    private readonly sensitiveLists = inject(SensitiveListsService);
    private readonly router = inject(Router);
    private readonly crypto = inject(CryptoService);

    protected readonly themeOptions: { value: Theme; labelKey: string; descKey: string }[] = [
        { value: 'system', labelKey: 'SETTINGS.THEME.SYSTEM', descKey: 'SETTINGS.THEME.SYSTEM_DESC' },
        { value: 'light',  labelKey: 'SETTINGS.THEME.LIGHT',  descKey: 'SETTINGS.THEME.LIGHT_DESC'  },
        { value: 'dark',   labelKey: 'SETTINGS.THEME.DARK',   descKey: 'SETTINGS.THEME.DARK_DESC'   },
    ];

    protected readonly accentOptions: { value: ThemeAccent; labelKey: string; color: string }[] = [
        { value: 'violet', labelKey: 'SETTINGS.ACCENT.VIOLET', color: '#7c6af7' },
        { value: 'cyan',   labelKey: 'SETTINGS.ACCENT.CYAN',   color: '#06b6d4' },
        { value: 'red',    labelKey: 'SETTINGS.ACCENT.RED',    color: '#f87171' },
        { value: 'noir',   labelKey: 'SETTINGS.ACCENT.NOIR',   color: 'linear-gradient(135deg, #111114 50%, #f0f0f2 50%)' },
    ];

    protected readonly supportedLangs = LanguageService.SUPPORTED;

    protected readonly pendingName = signal('');
    protected readonly nameSaved = signal(false);

    constructor() {
        effect(() => {
            const name = this.prefs.senderName();
            if (name && !this.pendingName()) this.pendingName.set(name);
        });
    }

    setTheme(theme: Theme): void {
        this.themeService.set(theme);
    }

    setAccent(accent: ThemeAccent): void {
        this.themeService.setAccent(accent);
    }

    async setLanguage(code: string): Promise<void> {
        await this.langService.setLanguage(code);
    }

    setHapticsEnabled(enabled: boolean): void {
        this.prefs.setHapticsEnabled(enabled);
    }

    saveName(): void {
        const name = this.pendingName().trim();
        if (!name) return;
        this.prefs.setSenderName(name);
        this.nameSaved.set(true);
        setTimeout(() => this.nameSaved.set(false), 2000);
    }

    goBack(): void {
        this.router.navigate(['/']);
    }

    protected readonly autoLockOptions = AUTO_LOCK_OPTIONS;

    protected readonly biometricWorking = signal(false);
    protected readonly biometricError = signal<'unsupported' | 'failed' | null>(null);

    async enableBiometricLock(): Promise<void> {
        if (!this.webAuthn.isSupported()) {
            this.biometricError.set('unsupported');
            return;
        }
        this.biometricWorking.set(true);
        this.biometricError.set(null);
        try {
            await this.webAuthn.register();
        } catch {
            this.biometricError.set('failed');
        } finally {
            this.biometricWorking.set(false);
        }
    }

    async disableBiometricLock(): Promise<void> {
        this.biometricWorking.set(true);
        this.biometricError.set(null);
        try {
            const ok = await this.webAuthn.authenticate();
            if (ok) {
                await this.webAuthn.disable();
            } else {
                this.biometricError.set('failed');
            }
        } catch {
            this.biometricError.set('failed');
        } finally {
            this.biometricWorking.set(false);
        }
    }

    // --- Master password (gates sensitive lists) ---

    protected static readonly MP_MIN_LENGTH = 4;

    protected readonly mpMode = signal<'view' | 'set' | 'change' | 'remove'>('view');
    protected readonly mpCurrentPassword = signal('');
    protected readonly mpNewPassword = signal('');
    protected readonly mpConfirmPassword = signal('');
    protected readonly mpError = signal<string | null>(null);
    protected readonly mpWorking = signal(false);
    protected readonly mpSaved = signal(false);

    startSetMasterPassword(): void {
        this.resetMpFields();
        this.mpMode.set('set');
    }

    startChangeMasterPassword(): void {
        this.resetMpFields();
        this.mpMode.set('change');
    }

    startRemoveMasterPassword(): void {
        this.resetMpFields();
        this.mpMode.set('remove');
    }

    cancelMasterPassword(): void {
        this.resetMpFields();
        this.mpMode.set('view');
    }

    private resetMpFields(): void {
        this.mpCurrentPassword.set('');
        this.mpNewPassword.set('');
        this.mpConfirmPassword.set('');
        this.mpError.set(null);
    }

    async submitSetMasterPassword(): Promise<void> {
        if (this.mpWorking()) return;
        const next = this.mpNewPassword();
        const confirm = this.mpConfirmPassword();
        if (next.length < SettingsComponent.MP_MIN_LENGTH) {
            this.mpError.set('SETTINGS.SECURITY.MASTER_PASSWORD.ERROR_TOO_SHORT');
            return;
        }
        if (next !== confirm) {
            this.mpError.set('SETTINGS.SECURITY.MASTER_PASSWORD.ERROR_MISMATCH');
            return;
        }
        this.mpWorking.set(true);
        this.mpError.set(null);
        try {
            await this.masterPassword.setPassword(next);
            this.resetMpFields();
            this.mpMode.set('view');
            this.flashMpSaved();
        } finally {
            this.mpWorking.set(false);
        }
    }

    async submitChangeMasterPassword(): Promise<void> {
        if (this.mpWorking()) return;
        const current = this.mpCurrentPassword();
        const next = this.mpNewPassword();
        const confirm = this.mpConfirmPassword();
        if (next.length < SettingsComponent.MP_MIN_LENGTH) {
            this.mpError.set('SETTINGS.SECURITY.MASTER_PASSWORD.ERROR_TOO_SHORT');
            return;
        }
        if (next !== confirm) {
            this.mpError.set('SETTINGS.SECURITY.MASTER_PASSWORD.ERROR_MISMATCH');
            return;
        }
        this.mpWorking.set(true);
        this.mpError.set(null);
        try {
            const ok = await this.masterPassword.verifyPassword(current);
            if (!ok) {
                this.mpError.set('SETTINGS.SECURITY.MASTER_PASSWORD.ERROR_CURRENT_INVALID');
                return;
            }
            await this.masterPassword.setPassword(next);
            this.resetMpFields();
            this.mpMode.set('view');
            this.flashMpSaved();
        } finally {
            this.mpWorking.set(false);
        }
    }

    async submitRemoveMasterPassword(): Promise<void> {
        if (this.mpWorking()) return;
        const current = this.mpCurrentPassword();
        this.mpWorking.set(true);
        this.mpError.set(null);
        try {
            const ok = await this.masterPassword.verifyPassword(current);
            if (!ok) {
                this.mpError.set('SETTINGS.SECURITY.MASTER_PASSWORD.ERROR_CURRENT_INVALID');
                return;
            }
            await this.masterPassword.removePassword();
            this.sensitiveLists.hide();
            // Unmark all sensitive lists on this device — without a master
            // password there would be no way to reveal them again.
            for (const list of this.store.knownLists()) {
                if (list.isSensitive) await this.store.setListSensitive(list.id, false);
            }
            this.resetMpFields();
            this.mpMode.set('view');
            this.flashMpSaved();
        } finally {
            this.mpWorking.set(false);
        }
    }

    private flashMpSaved(): void {
        this.mpSaved.set(true);
        setTimeout(() => this.mpSaved.set(false), 2000);
    }

    private async confirmSyncAuth(): Promise<boolean> {
        try {
            return await this.webAuthn.authenticate();
        } catch {
            return false;
        }
    }

    protected readonly syncStep = signal<
        'idle' | 'receive-qr' | 'receive-done' |
        'send-choose' | 'send-scan' | 'send-done' |
        'send-qr' | 'send-qr-done' |
        'error'
    >('idle');
    protected readonly syncQrData = signal<string | null>(null);
    protected readonly syncImportedCount = signal(0);
    protected readonly syncLinkCopied = signal(false);
    private syncPollTimer: ReturnType<typeof setInterval> | null = null;
    private syncSessionId: string | null = null;
    private syncPayload: SyncQrPayload | null = null;

    async startSyncReceive(): Promise<void> {
        if (!await this.confirmSyncAuth()) return;
        this.resetSync();
        try {
            const payload: SyncQrPayload = await this.store.initSyncReceive();
            this.syncSessionId = payload.sessionId;
            this.syncPayload = payload;
            this.syncQrData.set(JSON.stringify(payload));
            this.syncStep.set('receive-qr');
            this.startReceivePoll(payload.sessionId);
        } catch {
            this.syncStep.set('error');
        }
    }

    async copySyncLink(): Promise<void> {
        if (!this.syncPayload) return;
        const origin = Capacitor.isNativePlatform()
            ? environment.nativeShareBaseUrl
            : window.location.origin;
        const url = `${origin}/sync/${this.syncPayload.sessionId}#${this.crypto.toUrlSafeB64(this.syncPayload.publicKey)}`;
        try {
            await navigator.clipboard.writeText(url);
        } catch { }
        this.syncLinkCopied.set(true);
        setTimeout(() => this.syncLinkCopied.set(false), 2000);
    }

    private startReceivePoll(sessionId: string): void {
        this.syncPollTimer = setInterval(async () => {
            try {
                const count = await this.store.claimSyncBundle(sessionId);
                this.stopSyncPoll();
                this.syncImportedCount.set(count);
                this.syncStep.set('receive-done');
            } catch { }
        }, 2000);
    }

    async startSyncSend(): Promise<void> {
        if (!await this.confirmSyncAuth()) return;
        this.resetSync();
        this.syncStep.set('send-choose');
    }

    startSyncSendScan(): void {
        this.syncStep.set('send-scan');
    }

    async onSyncQrDetected(raw: string): Promise<void> {
        try {
            const payload = JSON.parse(raw) as SyncQrPayload;
            if (payload.type !== 'sync') throw new Error('Not a sync QR.');
            await this.store.pushSyncBundle(payload.sessionId, payload.publicKey);
            this.syncStep.set('send-done');
        } catch {
            this.syncStep.set('error');
        }
    }

    startSyncSendQr(): void {
        this.resetSync();
        try {
            const payload = this.store.initSyncSend();
            this.syncSessionId = payload.sessionId;
            this.syncQrData.set(JSON.stringify(payload));
            this.syncStep.set('send-qr');
            this.startSendQrPoll(payload.sessionId);
        } catch {
            this.syncStep.set('error');
        }
    }

    private startSendQrPoll(sessionId: string): void {
        this.syncPollTimer = setInterval(async () => {
            try {
                await this.store.pollAndPushSyncBundle(sessionId);
                this.stopSyncPoll();
                this.syncStep.set('send-qr-done');
            } catch { }
        }, 2000);
    }

    private stopSyncPoll(): void {
        if (this.syncPollTimer !== null) {
            clearInterval(this.syncPollTimer);
            this.syncPollTimer = null;
        }
    }

    resetSync(): void {
        this.stopSyncPoll();
        this.syncQrData.set(null);
        this.syncLinkCopied.set(false);
        this.syncSessionId = null;
        this.syncPayload = null;
        this.syncImportedCount.set(0);
        this.syncStep.set('idle');
    }
}
