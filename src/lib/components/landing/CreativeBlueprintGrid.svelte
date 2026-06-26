<script lang="ts">
  import { PRODUCTS } from '$lib/data/products';
  import BlueprintSpecCard from './BlueprintSpecCard.svelte';

  // Take mock products representing different tools, filtering out Zenith Editor (p1)
  const featured = PRODUCTS.filter(p => p.id !== 'p1').slice(0, 4);
  
  // Duplicate the array to create a seamless infinite marquee scroll loop
  const loopList = [...featured, ...featured];
</script>

<section class="w-full py-16 bg-surface-2/20 dark:bg-surface-3/5 border-y border-border-custom/30 relative overflow-hidden transition-all duration-300">
  
  <!-- Subtle warm ambient background light behind the carousel -->
  <div class="absolute inset-0 pointer-events-none z-0">
    <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[300px] rounded-full bg-brand-from/3 dark:bg-brand-from/6 blur-[110px]"></div>
  </div>

  <!-- Header Title (Symmetric and Craft-Oriented) -->
  <div class="max-w-7xl mx-auto px-6 text-center mb-12 relative z-10">
    <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-from/5 border border-brand-from/15 font-mono text-[9px] font-extrabold tracking-widest text-brand-from uppercase shadow-[0_1px_2px_rgba(0,0,0,0.01)]">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" class="w-2.5 h-2.5 animate-pulse"><circle cx="12" cy="12" r="10"/><path d="m12 8-4 4 4 4m4-4H8"/></svg>
      Craft Spec Showcase
    </span>
    
    <h2 class="font-heading text-2xl sm:text-3xl font-extrabold text-text-primary tracking-tight mt-3">
      Software as an Art Form
    </h2>
    <p class="font-body text-xs sm:text-sm text-text-secondary mt-2 max-w-xl mx-auto leading-relaxed">
      Continuous live spec feeds representing our finest community products. Hover to inspect precise wireframe layouts, rotate dials, test edge waveforms, and trigger interactive nodes.
    </p>
  </div>

  <!-- Infinite Loop Marquee Wrapper -->
  <div class="marquee-wrapper relative w-full overflow-hidden z-10 py-4 select-none">
    
    <!-- Left Vignette Edge Blur Mask (Sleek fade ingress) -->
    <div class="absolute inset-y-0 left-0 w-16 sm:w-40 bg-gradient-to-r from-surface-2 via-surface-2/90 to-transparent dark:from-surface dark:via-surface/90 pointer-events-none z-20"></div>

    <!-- Right Vignette Edge Blur Mask (Sleek fade egress) -->
    <div class="absolute inset-y-0 right-0 w-16 sm:w-40 bg-gradient-to-l from-surface-2 via-surface-2/90 to-transparent dark:from-surface dark:via-surface/90 pointer-events-none z-20"></div>

    <!-- Scrolling Marquee Track -->
    <div class="animate-marquee-horizontal flex gap-6 px-3">
      {#each loopList as product, index (product.id + '-' + index)}
        <div class="shrink-0 flex items-center justify-center p-2 transform-gpu">
          <BlueprintSpecCard {product} />
        </div>
      {/each}
    </div>

  </div>
</section>
