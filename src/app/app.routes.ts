import { Routes } from '@angular/router';

import { adminGuard } from './core/guards/admin.guard';
import { authGuard } from './core/guards/auth.guard';
import { guestGuard } from './core/guards/guest.guard';
import { DirectUploadPageComponent } from './features/files/direct-upload-page/direct-upload-page.component';
import { FileDetailPageComponent } from './features/files/file-detail-page/file-detail-page.component';
import { FilesDashboardPageComponent } from './features/files/files-dashboard-page/files-dashboard-page.component';
import { LoginPageComponent } from './features/auth/login-page/login-page.component';
import { RegisterPageComponent } from './features/auth/register-page/register-page.component';
import { SystemPageComponent } from './features/system/system-page/system-page.component';
import { WorkersPageComponent } from './features/workers/workers-page/workers-page.component';
import { AppShellComponent } from './layout/app-shell/app-shell.component';

export const routes: Routes = [
  {
    path: 'login',
    component: LoginPageComponent,
    canActivate: [guestGuard]
  },
  {
    path: 'register',
    component: RegisterPageComponent,
    canActivate: [guestGuard]
  },
  {
    path: '',
    component: AppShellComponent,
    canActivate: [authGuard],
    children: [
      {
        path: '',
        pathMatch: 'full',
        redirectTo: 'files'
      },
      {
        path: 'files',
        component: FilesDashboardPageComponent
      },
      {
        path: 'files/:encodedPath',
        component: FileDetailPageComponent
      },
      {
        path: 'direct-upload',
        component: DirectUploadPageComponent
      },
      {
        path: 'system',
        component: SystemPageComponent,
        canActivate: [adminGuard]
      },
      {
        path: 'workers',
        component: WorkersPageComponent,
        canActivate: [adminGuard]
      }
    ]
  },
  {
    path: '**',
    redirectTo: 'files'
  }
];
