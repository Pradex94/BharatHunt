<script lang="ts">
  import { themeStore } from '$lib/stores/theme.svelte';
  
  let clicking = $state(false);

  function handleToggle() {
    clicking = true;
    setTimeout(() => { clicking = false; }, 200);
    themeStore.toggle();
  }
</script>

<button
  type="button"
  onclick={handleToggle}
  class="relative w-9 h-9 flex items-center justify-center rounded-[10px] bg-surface border border-border-custom shadow-card hover:shadow-card-hover hover:border-brand-from/20 transition-all duration-200 text-text-secondary hover:text-brand-from cursor-pointer active:scale-90 {clicking ? 'scale-95' : ''}"
  aria-label="Toggle dark mode"
>
  <!-- Sun Icon -->
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2.5"
    stroke-linecap="round"
    stroke-linejoin="round"
    class="w-4 h-4 absolute transition-all duration-300 {themeStore.current === 'dark' ? 'opacity-0 scale-50 rotate-90 pointer-events-none' : 'opacity-100 scale-100 rotate-0'}"
  >
    <circle cx="12" cy="12" r="4"/>
    <path d="M12 2v2"/>
    <path d="M12 20v2"/>
    <path d="m4.93 4.93 1.41 1.41"/>
    <path d="m17.66 17.66 1.41 1.41"/>
    <path d="M2 12h2"/>
    <path d="M20 12h2"/>
    <path d="m6.34 17.66-1.41 1.41"/>
    <path d="m19.07 4.93-1.41 1.41"/>
  </svg>

  <!-- Moon Icon -->
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2.5"
    stroke-linecap="round"
    stroke-linejoin="round"
    class="w-4 h-4 absolute transition-all duration-300 {themeStore.current === 'light' ? 'opacity-0 scale-50 -rotate-90 pointer-events-none' : 'opacity-100 scale-100 rotate-0'}"
  >
    <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>
  </svg>
</button>
