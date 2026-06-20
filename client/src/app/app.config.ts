import { provideHttpClient } from '@angular/common/http';
import { ApplicationConfig, inject, isDevMode, provideAppInitializer, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';
import { provideTranslateService } from '@ngx-translate/core';
import { provideTranslateHttpLoader } from '@ngx-translate/http-loader';

import { routes } from './app.routes';
import { LanguageService } from './core/services/language.service';
import { ShareHandlerService } from './core/services/share-handler.service';
import { SharedListsBridgeService } from './core/services/shared-lists-bridge.service';

export const appConfig: ApplicationConfig = {
    providers: [

        provideZonelessChangeDetection(),
        provideBrowserGlobalErrorListeners(),
        provideRouter(routes),
        provideHttpClient(),
        provideServiceWorker('ghost-sw.js', {
            enabled: !isDevMode(),
            registrationStrategy: 'registerWhenStable:30000',
        }),
        provideTranslateService({ fallbackLang: 'en_US' }),
        provideTranslateHttpLoader({ prefix: '/i18n/', suffix: '.json' }),
        provideAppInitializer(() => inject(LanguageService).init()),
        provideAppInitializer(() => inject(ShareHandlerService).initialize()),
        provideAppInitializer(() => inject(SharedListsBridgeService).initialize()),
    ],
};
