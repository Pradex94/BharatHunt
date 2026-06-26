<script lang="ts">
  import { PRODUCTS } from '$lib/data/products';
  import FilterBar from './FilterBar.svelte';
  import ProductCard from './ProductCard.svelte';
  import Button from '../ui/Button.svelte';
  import { flip } from 'svelte/animate';
  import { fade, fly } from 'svelte/transition';

  let activeFilter = $state('All');
  let searchQuery = $state('');
  let searchInput = $state<HTMLInputElement | null>(null);

  // Svelte 5 derived state for filtering
  let filteredProducts = $derived(
    PRODUCTS.filter(product => {
      const matchesCategory = activeFilter === 'All' || product.tags.includes(activeFilter);
      const matchesSearch = product.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            product.tagline.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    })
  );

  // Global keydown listener to focus search when '/' is pressed
  function handleKeydown(e: KeyboardEvent) {
    if (
      e.key === '/' && 
      document.activeElement?.tagName !== 'INPUT' && 
      document.activeElement?.tagName !== 'TEXTAREA'
    ) {
      e.preventDefault();
      searchInput?.focus();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<section id="products" class="max-w-7xl mx-auto px-6 py-20 transition-all duration-300">
  <!-- Heading & Search Row -->
  <div class="reveal-item flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-12">
    <div class="text-left">
      <!-- Title + Premium consistent live indicator -->
      <div class="flex flex-wrap items-center gap-3">
        <h2 class="font-heading text-3xl sm:text-4xl font-extrabold text-text-primary tracking-tight">
          Today's Top Picks
        </h2>
        <!-- Premium Cozy Flat-Skeuomorphic Live Badge -->
        <div class="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-surface-2 dark:bg-surface-3 border border-border-custom/50 shadow-inner-custom select-none">
          <span class="relative flex h-1.5 w-1.5">
            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-from opacity-75"></span>
            <span class="relative inline-flex rounded-full h-1.5 w-1.5 bg-brand-from"></span>
          </span>
          <span class="font-mono text-[9.5px] font-extrabold uppercase tracking-widest text-text-secondary">Live Feed</span>
        </div>
      </div>
      <!-- Rich Social Proof Subheadline -->
      <p class="font-body text-xs sm:text-[13.5px] text-text-secondary mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span>Discover and vote on the best newly released software products.</span>
        <span class="hidden sm:inline text-text-secondary/25 font-bold">•</span>
        <span class="inline-flex items-center gap-1 text-brand-from font-bold">
          🚀 12 launched today
        </span>
        <span class="hidden sm:inline text-text-secondary/25 font-bold">•</span>
        <span class="inline-flex items-center gap-1 text-text-primary font-bold">
          👥 4,200+ makers online
        </span>
      </p>
    </div>

    <!-- Premium Search Input Pill -->
    <div class="relative w-full lg:w-88 group">
      <input
        bind:this={searchInput}
        type="text"
        bind:value={searchQuery}
        placeholder="Search products..."
        class="w-full pl-11 pr-14 py-3 rounded-full border border-border-custom bg-surface dark:bg-surface-2 text-sm text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:border-brand-from focus:ring-4 focus:ring-brand-from/8 shadow-[inset_0_1.5px_2px_rgba(0,0,0,0.02),_0_2px_12px_rgba(0,0,0,0.02)] transition-all duration-300"
      />
      <!-- Search Icon SVG -->
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="w-4 h-4 text-text-secondary/40 absolute left-4 top-1/2 -translate-y-1/2 group-focus-within:text-brand-from group-focus-within:scale-105 transition-all duration-300"
      >
        <circle cx="11" cy="11" r="8"/>
        <path d="m21 21-4.3-4.3"/>
      </svg>

      <!-- Clear search button -->
      {#if searchQuery}
        <button
          onclick={() => searchQuery = ''}
          class="absolute right-10 top-1/2 -translate-y-1/2 text-text-secondary/40 hover:text-brand-from p-1 rounded-full hover:bg-surface-3 transition-colors duration-200 cursor-pointer active:scale-90"
          aria-label="Clear search"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      {/if}

      <!-- Keyboard Shortcut Badge -->
      <kbd class="hidden sm:inline-flex items-center justify-center w-5 h-5 font-mono text-[10px] font-extrabold text-text-secondary/40 border border-border-custom/50 bg-surface-2 dark:bg-surface-3 rounded-md absolute right-3.5 top-1/2 -translate-y-1/2 shadow-[inset_0_1px_0_rgba(255,255,255,0.7),_0_1px_2px_rgba(0,0,0,0.06)] pointer-events-none select-none">
        /
      </kbd>
    </div>
  </div>

  <!-- Interactive Filters -->
  <div class="reveal-item">
    <FilterBar bind:activeFilter />
  </div>

  <!-- Products Feed Grid -->
  {#if filteredProducts.length > 0}
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {#each filteredProducts as product (product.id)}
        <div 
          animate:flip={{ duration: 400 }}
          in:fly={{ y: 15, duration: 350 }}
          out:fade={{ duration: 200 }}
          class="reveal-item h-full"
        >
          <ProductCard {product} />
        </div>
      {/each}
    </div>
  {:else}
    <!-- Empty State -->
    <div class="w-full flex flex-col items-center justify-center py-20 px-6 border-2 border-dashed border-border-custom rounded-3xl bg-surface/40 text-center shadow-sm">
      <div class="w-12 h-12 rounded-full bg-brand-from/10 flex items-center justify-center text-brand-from mb-4 shadow-[inset_0_1px_2px_rgba(255,255,255,0.2)]">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-6 h-6"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      </div>
      <h3 class="font-heading text-lg font-bold text-text-primary">No products found</h3>
      <p class="font-body text-sm text-text-secondary mt-1.5 max-w-xs leading-relaxed">
        We couldn't find any products matching "{searchQuery}" under "{activeFilter}". Try widening your search!
      </p>
    </div>
  {/if}

  <!-- Footer Link -->
  <div class="reveal-item flex justify-center mt-14">
    <Button variant="secondary" size="md" class="gap-1.5 hover:gap-2">
      See all products <span class="transition-transform duration-200">→</span>
    </Button>
  </div>
</section>
