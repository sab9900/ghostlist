import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

// list-detail.component.ts statically imports all 5 tab components, so its
// lazy chunk is by far the heaviest in the app — and it's also the very
// next screen almost every session navigates to from the lists landing
// page. withPreloading(PreloadAllModules) (see app.config.ts) only starts
// fetching it after the *first* NavigationEnd, i.e. after bootstrap, DI
// setup, and the App constructor's webAuthn/prefs/language init have all
// already run — a fast first tap can still beat it there. Firing the fetch
// here instead races it against bootstrap itself, so it has the whole
// pre-render window as a head start instead of starting from zero once the
// app is already interactive.
void import('./app/features/list-detail/list-detail.component');

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
