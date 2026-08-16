import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { AuthService } from '../../core/services/auth.service';
import { FileCacheService } from '../../core/services/file-cache.service';
import { ThemeService } from '../../core/services/theme.service';
import { ToastService } from '../../core/services/toast.service';

interface NavigationItem {
  label: string;
  shortLabel: string;
  icon: string;
  route: string;
  adminOnly?: boolean;
  hideFromSidebar?: boolean;
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
  protected readonly themeService = inject(ThemeService);
  protected readonly menuOpen = signal(false);
  protected readonly userMenuOpen = signal(false);
  private readonly router = inject(Router);

  private readonly navigationItems: NavigationItem[] = [
    { label: 'Files', shortLabel: 'Files', icon: 'fa-solid fa-folder-open', route: '/files' },
    { label: 'Upload', shortLabel: 'Upload', icon: 'fa-solid fa-upload', route: '/direct-upload', hideFromSidebar: true },
    { label: 'System status', shortLabel: 'Status', icon: 'fa-solid fa-server', route: '/system', adminOnly: true },
    { label: 'Admin tools', shortLabel: 'Admin', icon: 'fa-solid fa-screwdriver-wrench', route: '/workers', adminOnly: true }
  ];

  protected readonly navItems = computed(() =>
    this.navigationItems.filter((item) => !item.adminOnly || this.auth.isAdmin())
  );

  protected readonly sidebarItems = computed(() =>
    this.navItems().filter((item) => !item.hideFromSidebar)
  );

  protected readonly sidebarCollapsed = signal(false);

  protected toggleSidebar(): void {
    this.sidebarCollapsed.update((v) => !v);
  }

  protected toggleMenu(): void {
    this.menuOpen.update((value) => !value);
  }

  protected navigateToSettings(): void {
    this.userMenuOpen.set(false);
    this.menuOpen.set(false);
    void this.router.navigateByUrl('/settings');
  }

  protected async logout(): Promise<void> {
    this.menuOpen.set(false);
    await this.fileCache.clearAll();
    await this.auth.logout();
    this.toast.info('Signed out', 'Your access token and local session state were cleared.');
  }
}
