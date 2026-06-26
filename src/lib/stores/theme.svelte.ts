import { browser } from '$app/environment';

class ThemeStore {
  current = $state<'light' | 'dark'>('light');

  constructor() {
    if (browser) {
      const stored = localStorage.getItem('theme');
      if (stored === 'light' || stored === 'dark') {
        this.current = stored;
      } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
        this.current = 'dark';
      }
      this.apply();
    }
  }

  toggle() {
    this.current = this.current === 'light' ? 'dark' : 'light';
    if (browser) {
      localStorage.setItem('theme', this.current);
      this.apply();
    }
  }

  private apply() {
    if (browser) {
      if (this.current === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  }
}

export const themeStore = new ThemeStore();
