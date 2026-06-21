import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { LucideChevronLeft } from '@lucide/angular';
import { TranslatePipe } from '@ngx-translate/core';
import { SwipeBackDirective } from '../../core/directives/swipe-back.directive';
import { LanguageService } from '../../core/services/language.service';
import { LayoutService } from '../../core/services/layout.service';
import { MasterPasswordService } from '../../core/services/master-password.service';
import { PushNotificationService } from '../../core/services/push-notification.service';
import { SensitiveListsService } from '../../core/services/sensitive-lists.service';
import { Theme, ThemeAccent, ThemeService } from '../../core/services/theme.service';
import { UserPreferencesService } from '../../core/services/user-preferences.service';
import { VaultKeyService } from '../../core/services/vault-key.service';
import { VaultMigrationService } from '../../core/services/vault-migration.service';
import { AUTO_LOCK_OPTIONS, PrfUnsupportedError, WebAuthnService } from '../../core/services/webauthn.service';
import { AppStore } from '../../store/app.store';
import { AppearanceSectionComponent } from './components/appearance-section/appearance-section.component';
import { BiometricConfirmDialogComponent } from './components/biometric-confirm-dialog/biometric-confirm-dialog.component';
import { HapticsSectionComponent } from './components/haptics-section/haptics-section.component';
import { LanguageSectionComponent } from './components/language-section/language-section.component';
import { MasterPasswordSectionComponent } from './components/master-password-section/master-password-section.component';
import { NameSectionComponent } from './components/name-section/name-section.component';
import { NotificationsSectionComponent } from './components/notifications-section/notifications-section.component';
import { RecoveryCodeDialogComponent } from './components/recovery-code-dialog/recovery-code-dialog.component';
import { SecuritySectionComponent } from './components/security-section/security-section.component';
import { SyncDialogComponent } from './components/sync-dialog/sync-dialog.component';
import { SyncSectionComponent } from './components/sync-section/sync-section.component';

@Component({
    selector: 'app-settings',
    imports: [
        TranslatePipe,
        SwipeBackDirective,
        LucideChevronLeft,
        NameSectionComponent,
        AppearanceSectionComponent,
        SecuritySectionComponent,
        MasterPasswordSectionComponent,
        SyncSectionComponent,
        NotificationsSectionComponent,
        HapticsSectionComponent,
        LanguageSectionComponent,
        SyncDialogComponent,
        RecoveryCodeDialogComponent,
        BiometricConfirmDialogComponent,
    ],
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
    private readonly vaultKey = inject(VaultKeyService);
    private readonly vaultMigration = inject(VaultMigrationService);
    private readonly push = inject(PushNotificationService);
    private readonly sensitiveLists = inject(SensitiveListsService);
    private readonly router = inject(Router);

    protected readonly webPushPermission = this.push.webPushPermission;
    protected readonly notificationsEnabled = this.prefs.notificationsEnabled;
    protected readonly notifEnabling = signal(false);
    protected readonly pushActive = this.push.pushActive;

    protected readonly themeOptions: { value: Theme; labelKey: string; descKey: string }[] = [
        { value: 'system', labelKey: 'SETTINGS.THEME.SYSTEM', descKey: 'SETTINGS.THEME.SYSTEM_DESC' },
        { value: 'light', labelKey: 'SETTINGS.THEME.LIGHT', descKey: 'SETTINGS.THEME.LIGHT_DESC' },
        { value: 'dark', labelKey: 'SETTINGS.THEME.DARK', descKey: 'SETTINGS.THEME.DARK_DESC' },
    ];

    protected readonly accentOptions: { value: ThemeAccent; labelKey: string; color: string }[] = [
        { value: 'violet', labelKey: 'SETTINGS.ACCENT.VIOLET', color: '#7c6af7' },
        { value: 'cyan', labelKey: 'SETTINGS.ACCENT.CYAN', color: '#06b6d4' },
        { value: 'red', labelKey: 'SETTINGS.ACCENT.RED', color: '#f87171' },
        { value: 'noir', labelKey: 'SETTINGS.ACCENT.NOIR', color: 'linear-gradient(135deg, #111114 50%, #f0f0f2 50%)' },
    ];

    protected readonly supportedLangs = LanguageService.SUPPORTED;
    protected readonly autoLockOptions = AUTO_LOCK_OPTIONS;

    protected readonly biometricWorking = signal(false);
    protected readonly biometricError = signal<'unsupported' | 'failed' | null>(null);
    protected readonly showBiometricConfirm = signal(false);
    protected readonly biometricConfirmError = signal(false);

    protected readonly mpMode = signal<'view' | 'set' | 'change' | 'remove'>('view');
    protected readonly mpError = signal<string | null>(null);
    protected readonly mpWorking = signal(false);
    protected readonly mpSaved = signal(false);

    protected readonly showSyncDialog = signal(false);
    protected readonly syncStep = signal<'idle' | 'qr' | 'scan' | 'waiting' | 'done' | 'error'>('idle');
    protected readonly syncImportedCount = signal(0);

    setTheme(theme: Theme): void { this.themeService.set(theme); }
    setAccent(accent: ThemeAccent): void { this.themeService.setAccent(accent); }
    async setLanguage(code: string): Promise<void> { await this.langService.setLanguage(code); }
    setHapticsEnabled(enabled: boolean): void { this.prefs.setHapticsEnabled(enabled); }

    saveName(name: string): void { this.prefs.setSenderName(name); }

    goBack(): void { this.router.navigate(['/']); }

    async enableBiometricLock(): Promise<void> {
        if (!this.webAuthn.isSupported()) { this.biometricError.set('unsupported'); return; }

        if (!this.masterPassword.hasPassword()) {
            this.mpMode.set('set');
            return;
        }

        if (!this.vaultKey.isUnlocked()) {
            this.biometricConfirmError.set(false);
            this.showBiometricConfirm.set(true);
            return;
        }

        await this.finishEnableBiometric();
    }

    async confirmBiometricPassword(password: string): Promise<void> {
        this.biometricWorking.set(true);
        this.biometricConfirmError.set(false);
        try {
            const ok = await this.masterPassword.verifyPassword(password);
            if (!ok) { this.biometricConfirmError.set(true); return; }
            this.showBiometricConfirm.set(false);
            await this.finishEnableBiometric();
        } finally {
            this.biometricWorking.set(false);
        }
    }

    cancelBiometricConfirm(): void {
        this.showBiometricConfirm.set(false);
        this.biometricConfirmError.set(false);
    }

    private async finishEnableBiometric(): Promise<void> {
        this.biometricWorking.set(true);
        this.biometricError.set(null);
        try {
            await this.webAuthn.register();
            await this.vaultMigration.wrapLists('all');
            await this.store.unlockKnownLists();
        } catch (e) {
            this.biometricError.set(e instanceof PrfUnsupportedError ? 'unsupported' : 'failed');
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
                await this.vaultMigration.shrinkScopeToSensitive();
                await this.store.unlockKnownLists();
            }
            else { this.biometricError.set('failed'); }
        } catch { this.biometricError.set('failed'); }
        finally { this.biometricWorking.set(false); }
    }

    async toggleNotifications(enabled: boolean): Promise<void> {
        if (enabled) {
            if (this.notifEnabling()) return;
            this.notifEnabling.set(true);
            try {
                const listIds = this.store.knownLists().map(l => l.id);
                await this.push.enablePush(listIds);
                if (this.push.webPushPermission() !== 'denied') {
                    this.prefs.setNotificationsEnabled(true);
                    this.prefs.markNotifPrompted();
                }
            } finally { this.notifEnabling.set(false); }
        } else {
            this.prefs.setNotificationsEnabled(false);
        }
    }

    private static readonly MP_MIN_LENGTH = 4;

    async submitSetMasterPassword(newPassword: string): Promise<void> {
        if (this.mpWorking()) return;
        if (newPassword.length < SettingsComponent.MP_MIN_LENGTH) {
            this.mpError.set('SETTINGS.SECURITY.MASTER_PASSWORD.ERROR_TOO_SHORT'); return;
        }
        this.mpWorking.set(true);
        this.mpError.set(null);
        try {
            await this.masterPassword.setPassword(newPassword);
            this.mpMode.set('view');
            this.flashMpSaved();
        } finally { this.mpWorking.set(false); }
    }

    async submitChangeMasterPassword(payload: { current: string; next: string }): Promise<void> {
        if (this.mpWorking()) return;
        if (payload.next.length < SettingsComponent.MP_MIN_LENGTH) {
            this.mpError.set('SETTINGS.SECURITY.MASTER_PASSWORD.ERROR_TOO_SHORT'); return;
        }
        this.mpWorking.set(true);
        this.mpError.set(null);
        try {
            const ok = await this.masterPassword.verifyPassword(payload.current);
            if (!ok) { this.mpError.set('SETTINGS.SECURITY.MASTER_PASSWORD.ERROR_CURRENT_INVALID'); return; }
            await this.masterPassword.setPassword(payload.next);
            this.mpMode.set('view');
            this.flashMpSaved();
        } finally { this.mpWorking.set(false); }
    }

    async submitRemoveMasterPassword(currentPassword: string): Promise<void> {
        if (this.mpWorking()) return;
        this.mpWorking.set(true);
        this.mpError.set(null);
        try {
            const ok = await this.masterPassword.verifyPassword(currentPassword);
            if (!ok) { this.mpError.set('SETTINGS.SECURITY.MASTER_PASSWORD.ERROR_CURRENT_INVALID'); return; }

            if (this.webAuthn.isEnabled()) {
                await this.webAuthn.disable();
            }
            await this.vaultMigration.unwrapAllToPlaintext();
            await this.store.unlockKnownLists();

            this.sensitiveLists.hide();
            for (const list of this.store.knownLists()) {
                if (list.isSensitive) await this.store.setListSensitive(list.id, false);
            }

            await this.masterPassword.removePassword();
            this.mpMode.set('view');
            this.flashMpSaved();
        } finally { this.mpWorking.set(false); }
    }

    cancelMasterPassword(): void { this.mpMode.set('view'); this.mpError.set(null); }

    acknowledgeRecoveryCode(): void {
        this.masterPassword.acknowledgeRecoveryCode();
    }

    private flashMpSaved(): void {
        this.mpSaved.set(true);
        setTimeout(() => this.mpSaved.set(false), 2000);
    }

    async startSync(): Promise<void> {
        try {
            const ok = await this.webAuthn.authenticate();
            if (!ok) return;
        } catch { return; }
        this.showSyncDialog.set(true);
    }

    onSyncDone(count: number): void {
        this.syncImportedCount.set(count);
        this.syncStep.set('done');
    }
}
