<script lang="ts">
  import ThemeToggle from '../ui/ThemeToggle.svelte';
  import Button from '../ui/Button.svelte';
  
  let scrolled = $state(false);
  let mobileMenuOpen = $state(false);

  function handleScroll() {
    scrolled = window.scrollY > 20;
  }
</script>

<svelte:window onscroll={handleScroll} />

<nav
  class="fixed top-4 left-1/2 -translate-x-1/2 z-50 transition-all duration-300 w-[calc(100%-2rem)] max-w-5xl rounded-full border
    {scrolled 
      ? 'bg-surface/85 dark:bg-surface/75 backdrop-blur-md border-border-custom/80 shadow-md py-2' 
      : 'bg-surface/50 dark:bg-surface/20 backdrop-blur-sm border-border-custom/40 shadow-sm py-2.5'
    }"
>
  <div class="px-5 flex items-center justify-between">
    <!-- Logo -->
    <a href="/" class="flex items-center gap-2.5 group">
      <div class="relative w-8.5 h-8.5 rounded-[10px] bg-gradient-to-br from-brand-from to-brand-to flex items-center justify-center shadow-md shadow-brand-from/20 overflow-hidden">
        <!-- Logo Icon: Stacking layered tank look -->
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="3"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="w-4 h-4 text-white transition-transform duration-500 group-hover:rotate-12"
        >
          <path d="M12 22a7 7 0 0 0 7-7H5a7 7 0 0 0 7 7Z"/>
          <path d="M12 11V3"/>
          <path d="M9 3h6"/>
        </svg>
      </div>
      <span class="font-heading text-lg font-black tracking-tight text-text-primary">
        Tech<span class="bg-gradient-to-r from-brand-from to-brand-to bg-clip-text text-transparent">Tank</span>
      </span>
    </a>

    <!-- Center Navigation Links -->
    <div class="hidden md:flex items-center gap-8">
      {#each ['Products', 'Makers', 'Categories', 'About'] as item}
        <a
          href="#{item.toLowerCase()}"
          class="font-body text-sm font-medium text-text-secondary hover:text-brand-from transition-colors duration-200"
        >
          {item}
        </a>
      {/each}
    </div>

    <!-- Right Side Actions -->
    <div class="hidden md:flex items-center gap-4">
      <ThemeToggle />
      <Button variant="primary" size="md" href="#newsletter">
        Get early access
      </Button>
    </div>

    <!-- Mobile Menu Button -->
    <div class="flex items-center gap-3 md:hidden">
      <ThemeToggle />
      <button
        type="button"
        onclick={() => mobileMenuOpen = !mobileMenuOpen}
        class="w-9 h-9 flex items-center justify-center rounded-[10px] bg-surface border border-border-custom shadow-card text-text-secondary hover:text-brand-from cursor-pointer"
        aria-label="Toggle navigation menu"
      >
        {#if mobileMenuOpen}
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-4.5 h-4.5">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        {:else}
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-4.5 h-4.5">
            <line x1="4" y1="12" x2="20" y2="12"></line>
            <line x1="4" y1="6" x2="20" y2="6"></line>
            <line x1="4" y1="18" x2="20" y2="18"></line>
          </svg>
        {/if}
      </button>
    </div>
  </div>

  <!-- Mobile Drawer -->
  {#if mobileMenuOpen}
    <div
      class="md:hidden absolute top-[calc(100%+0.5rem)] left-0 right-0 bg-surface border border-border-custom rounded-2xl shadow-lg flex flex-col p-6 gap-5 animate-in slide-in-from-top-4 duration-200"
    >
      <div class="flex flex-col gap-4">
        {#each ['Products', 'Makers', 'Categories', 'About'] as item}
          <a
            href="#{item.toLowerCase()}"
            onclick={() => mobileMenuOpen = false}
            class="font-body text-base font-semibold text-text-secondary hover:text-brand-from py-2 transition-colors duration-200"
          >
            {item}
          </a>
        {/each}
      </div>
      <div class="h-px bg-border-custom"></div>
      <Button variant="primary" size="md" class="w-full" href="#newsletter" onclick={() => mobileMenuOpen = false}>
        Get early access
      </Button>
    </div>
  {/if}
</nav>
