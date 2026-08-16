import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { AuthService } from '../../core/services/auth.service';
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
  template: `
    <div class="min-h-screen bg-slate-950 text-slate-100">
      <header class="sticky top-0 z-30 border-b border-white/10 bg-slate-950/85 backdrop-blur-xl">
        <div class="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div class="flex items-center gap-4">
            <div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-400/15 text-lg font-semibold text-cyan-300 shadow-lg shadow-cyan-950/40">
              DFS
            </div>
            <div>
              <p class="text-xs uppercase tracking-[0.3em] text-cyan-300/80">Distributed File Storage System</p>
              <h1 class="text-lg font-semibold text-white sm:text-xl">Your storage</h1>
            </div>
          </div>

          <div class="hidden items-center gap-3 md:flex">
            @if (auth.user(); as user) {
              <div class="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-right">
                <div class="flex items-center justify-end gap-2">
                  <p class="text-sm font-medium text-white">{{ user.email }}</p>
                  @if (user.isAdmin) {
                    <span class="rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.24em] text-amber-200">
                      Admin
                    </span>
                  }
                </div>
                <p class="text-xs text-slate-400">Signed in</p>
              </div>
            }
            <button
              type="button"
              class="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-100 transition hover:border-cyan-400/40 hover:bg-cyan-400/10"
              (click)="logout()"
            >
              Logout
            </button>
          </div>

          <button
            type="button"
            class="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white md:hidden"
            (click)="toggleMenu()"
            aria-label="Toggle navigation"
          >
            ☰
          </button>
        </div>

        <div class="border-t border-white/10 px-4 py-3 md:hidden" [class.hidden]="!menuOpen()">
          <nav class="grid grid-cols-2 gap-2">
            @for (item of navItems(); track item.route) {
              <a
                [routerLink]="item.route"
                routerLinkActive="border-cyan-400/40 bg-cyan-400/15 text-white"
                class="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-slate-300 transition"
                (click)="menuOpen.set(false)"
              >
                {{ item.label }}
              </a>
            }
            <button
              type="button"
              class="col-span-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-slate-100"
              (click)="logout()"
            >
              Logout
            </button>
          </nav>
        </div>
      </header>

      <div class="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[18rem_minmax(0,1fr)] lg:px-8 lg:py-8">
        <aside class="hidden lg:block">
          <div class="sticky top-28 space-y-6 rounded-[2rem] border border-white/10 bg-white/5 p-4 shadow-2xl shadow-slate-950/40 backdrop-blur-xl">
            <nav class="space-y-2">
              @for (item of navItems(); track item.route) {
                <a
                  [routerLink]="item.route"
                  routerLinkActive="bg-cyan-400/15 text-white shadow-inner shadow-cyan-400/10"
                  class="flex items-center justify-between rounded-2xl px-4 py-3 text-sm font-medium text-slate-300 transition hover:bg-white/5 hover:text-white"
                >
                  <span>{{ item.label }}</span>
                  <span class="text-slate-500">›</span>
                </a>
              }
            </nav>
          </div>
        </aside>

        <main class="min-w-0 space-y-6">
          <div class="overflow-x-auto lg:hidden">
            <div class="flex min-w-max gap-2 rounded-3xl border border-white/10 bg-white/5 p-2 backdrop-blur-xl">
              @for (item of navItems(); track item.route) {
                <a
                  [routerLink]="item.route"
                  routerLinkActive="bg-cyan-400/15 text-white"
                  class="rounded-2xl px-4 py-2 text-sm font-medium text-slate-300"
                >
                  {{ item.shortLabel }}
                </a>
              }
            </div>
          </div>

          <router-outlet></router-outlet>
        </main>
      </div>
    </div>
  `
})
export class AppShellComponent {
  private readonly toast = inject(ToastService);
  protected readonly auth = inject(AuthService);
  protected readonly menuOpen = signal(false);

  private readonly navigationItems: NavigationItem[] = [
    { label: 'Files', shortLabel: 'Files', route: '/files' },
    { label: 'Upload', shortLabel: 'Upload', route: '/direct-upload' },
    { label: 'System status', shortLabel: 'Status', route: '/system' },
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
    await this.auth.logout();
    this.toast.info('Signed out', 'Your access token and local session state were cleared.');
  }
}
