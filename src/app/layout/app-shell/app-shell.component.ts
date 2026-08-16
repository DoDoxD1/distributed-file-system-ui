import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { AuthService } from '../../core/services/auth.service';
import { FileCacheService } from '../../core/services/file-cache.service';
import { ToastService } from '../../core/services/toast.service';

interface NavigationItem {
  label: string;
  shortLabel: string;
  route: string;
  adminOnly?: boolean;
}

@Component({
  selector: 'app-app-shell',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './app-shell.component.html'
})
export class AppShellComponent {
  private readonly toast = inject(ToastService);
  private readonly fileCache = inject(FileCacheService);
  protected readonly auth = inject(AuthService);
  protected readonly menuOpen = signal(false);

  private readonly navigationItems: NavigationItem[] = [
    { label: 'Files', shortLabel: 'Files', route: '/files' },
    { label: 'Upload', shortLabel: 'Upload', route: '/direct-upload' },
    { label: 'System status', shortLabel: 'Status', route: '/system', adminOnly: true },
    { label: 'Admin tools', shortLabel: 'Admin', route: '/workers', adminOnly: true }
  ];

  protected readonly navItems = computed(() =>
    this.navigationItems.filter((item) => !item.adminOnly || this.auth.isAdmin())
  );

  protected toggleMenu(): void {
    this.menuOpen.update((value) => !value);
  }

  protected async logout(): Promise<void> {
    this.menuOpen.set(false);
    await this.fileCache.clearAll();
    await this.auth.logout();
    this.toast.info('Signed out', 'Your access token and local session state were cleared.');
  }
}
