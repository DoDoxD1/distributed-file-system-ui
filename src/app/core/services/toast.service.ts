import { Injectable, computed, signal } from '@angular/core';

export type ToastTone = 'success' | 'error' | 'info';

export interface ToastMessage {
  id: string;
  title: string;
  description?: string;
  tone: ToastTone;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly items = signal<ToastMessage[]>([]);

  readonly toasts = computed(() => this.items());

  show(toast: Omit<ToastMessage, 'id'>, durationMs = 5000): void {
    const id = crypto.randomUUID();
    const nextToast: ToastMessage = { id, ...toast };

    this.items.update((current) => [...current, nextToast]);
    window.setTimeout(() => this.remove(id), durationMs);
  }

  success(title: string, description?: string): void {
    this.show({ title, description, tone: 'success' });
  }

  error(title: string, description?: string): void {
    this.show({ title, description, tone: 'error' }, 7000);
  }

  info(title: string, description?: string): void {
    this.show({ title, description, tone: 'info' });
  }

  remove(id: string): void {
    this.items.update((current) => current.filter((toast) => toast.id !== id));
  }
}
