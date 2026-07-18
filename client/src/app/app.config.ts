import { provideHttpClient } from '@angular/common/http';
import { ApplicationConfig, EnvironmentInjector, inject, isDevMode, provideAppInitializer, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection, runInInjectionContext } from '@angular/core';
import { PreloadAllModules, provideRouter, withPreloading } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';
import { Capacitor } from '@capacitor/core';
import { provideTranslateService } from '@ngx-translate/core';
import { provideTranslateHttpLoader } from '@ngx-translate/http-loader';

import { routes } from './app.routes';
import { LanguageService } from './core/services/language.service';
import { PrefsCacheService } from './core/services/prefs-cache.service';
import { ShareHandlerService } from './core/services/share-handler.service';
import { SharedListsBridgeService } from './core/services/shared-lists-bridge.service';
import { ThemeService } from './core/services/theme.service';

export const appConfig: ApplicationConfig = {
    providers: [

        provideZonelessChangeDetection(),
        provideBrowserGlobalErrorListeners(),
        // PreloadAllModules fetches every lazy `loadComponent` chunk (incl.
        // nested list-detail tabs) right after the *first* NavigationEnd —
        // i.e. once the initial route has already rendered, not as part of
        // the initial bundle. By the time the user actually triggers a
        // route change, the chunk is already in the browser/WebView cache,
        // so PageTransitionDirective's animation no longer stalls waiting
        // on a network/parse round-trip mid-transition.
        provideRouter(routes, withPreloading(PreloadAllModules)),
        provideHttpClient(),
        provideServiceWorker('ghost-sw.js', {
            enabled: !isDevMode() && !Capacitor.isNativePlatform(),
            registrationStrategy: 'registerWhenStable:30000',
        }),
        // On native the assets are bundled in the app package, so a service worker only adds a stale
        // caching layer in front of them — a fresh `cap copy` then keeps getting shadowed by the old
        // cache. Besides not registering one (above), actively unregister any SW a previous build left
        // behind and drop its caches, so existing installs self-heal on the next launch.
        provideAppInitializer(() => {
            if (!Capacitor.isNativePlatform()) return;
            if ('serviceWorker' in navigator) {
                void navigator.serviceWorker.getRegistrations().then(regs => regs.forEach(r => void r.unregister()));
            }
            if ('caches' in window) {
                void caches.keys().then(keys => keys.forEach(k => void caches.delete(k)));
            }
        }),
        provideTranslateService({ fallbackLang: 'en_US' }),
        provideTranslateHttpLoader({ prefix: '/i18n/', suffix: '.json' }),
        // Warms the IndexedDB preference cache and runs the one-time
        // localStorage migration (see PrefsCacheService). Registering it as
        // an app initializer guarantees the root component — and therefore
        // every service/component constructed as part of it — only ever
        // sees an already-warm cache.
        //
        // ThemeService is constructed right after, in the same initializer,
        // rather than left to whenever something first injects it (which
        // used to be only the Settings page). ThemeService applies
        // data-theme/data-accent to <html> as a side effect of its
        // constructor, and everything accent-colored — including the
        // ghost-mist's --color-primary streaks — depends on that attribute
        // having been set already. Constructing it before the cache is warm
        // would read prefsCache's pre-warm default instead of the persisted
        // accent, so it's chained onto warmUp() explicitly (inject() isn't
        // valid after an `await`/`.then()`, hence the captured injector).
        provideAppInitializer(() => {
            const injector = inject(EnvironmentInjector);
            return inject(PrefsCacheService).warmUp().then(() => {
                runInInjectionContext(injector, () => inject(ThemeService));
            });
        }),
        provideAppInitializer(() => inject(LanguageService).init()),
        provideAppInitializer(() => inject(ShareHandlerService).initialize()),
        provideAppInitializer(() => inject(SharedListsBridgeService).initialize()),
    ],
};
