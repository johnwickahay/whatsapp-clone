export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

export interface ToastOptions {
  duration?: number;
  id?: string;
}

class ToastManager {
  private listeners: ((toasts: Toast[]) => void)[] = [];
  private toasts: Toast[] = [];

  subscribe(listener: (toasts: Toast[]) => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notify() {
    this.listeners.forEach(l => l([...this.toasts]));
  }

  show(message: string, type: ToastType = 'info', options: ToastOptions = {}) {
    const id = options.id || Math.random().toString(36).substring(2, 9);
    const toast = { id, message, type };
    this.toasts.push(toast);
    this.notify();

    if (options.duration !== 0) {
      setTimeout(() => {
        this.remove(id);
      }, options.duration || 3000);
    }
    return id;
  }

  remove(id: string) {
    this.toasts = this.toasts.filter(t => t.id !== id);
    this.notify();
  }

  success(message: string, options?: ToastOptions) {
    return this.show(message, 'success', options);
  }

  error(message: string, options?: ToastOptions) {
    return this.show(message, 'error', options);
  }

  info(message: string, options?: ToastOptions) {
    return this.show(message, 'info', options);
  }

  warning(message: string, options?: ToastOptions) {
    return this.show(message, 'warning', options);
  }
}

export const toast = new ToastManager();
