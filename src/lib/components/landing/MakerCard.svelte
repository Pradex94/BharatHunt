<script lang="ts">
  import type { Maker } from '$lib/data/products';
  import { PRODUCTS } from '$lib/data/products';

  let { maker }: { maker: Maker } = $props();

  // Find their product and pitch
  const product = PRODUCTS.find(p => p.maker.id === maker.id);
  const pitch = product?.makerPitch;

  // Gentle 3D Tilt and Spotlight Glow states
  let rx = $state(0);
  let ry = $state(0);
  let mx = $state(0);
  let my = $state(0);
  let isHovered = $state(false);
  let cardRef = $state<HTMLDivElement | null>(null);

  function handleMouseMove(e: MouseEvent) {
    if (!cardRef) return;
    const rect = cardRef.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    
    // Very gentle 3D tilt (max 3 degrees) for a subtle natural depth
    const x = (e.clientX - rect.left) / width - 0.5;
    const y = (e.clientY - rect.top) / height - 0.5;
    
    rx = -y * 3;
    ry = x * 3;
    
    mx = e.clientX - rect.left;
    my = e.clientY - rect.top;
  }

  function handleMouseEnter() {
    isHovered = true;
  }

  function handleMouseLeave() {
    isHovered = false;
    rx = 0;
    ry = 0;
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  bind:this={cardRef}
  onmousemove={handleMouseMove}
  onmouseenter={handleMouseEnter}
  onmouseleave={handleMouseLeave}
  class="group reveal-item relative flex flex-col justify-between w-64 h-[380px] bg-surface dark:bg-surface-2 border border-border-custom/50 dark:border-border-custom/40 rounded-[22px] p-5 shadow-card hover:shadow-card-hover hover:border-brand-from/35 transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-[2px] select-none snap-start z-10 overflow-hidden transform-gpu shrink-0"
  style="
    transform: perspective(1000px) rotateX({rx}deg) rotateY({ry}deg);
    --mouse-x: {mx}px; --mouse-y: {my}px;
  "
>
  <!-- Extremely Soft Spotlight Cursor Glow -->
  <div 
    class="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500 z-0
           bg-[radial-gradient(280px_circle_at_var(--mouse-x)_var(--mouse-y),rgba(232,89,60,0.02),transparent)]
           dark:bg-[radial-gradient(280px_circle_at_var(--mouse-x)_var(--mouse-y),rgba(232,89,60,0.05),transparent)]"
  ></div>

  <!-- Diagonal warm subtle sheen sweep (slower, gentler) -->
  <div class="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-transparent dark:via-white/3 opacity-0 group-hover:opacity-100 -translate-x-full group-hover:translate-x-full transition-all duration-1000 ease-in-out pointer-events-none z-0"></div>

  <!-- Status Indicator LED bulb (Skeuomorphic, clean) -->
  <div class="flex items-center gap-1 absolute top-4 left-4 z-10 bg-surface-2/90 dark:bg-surface-3/90 px-2 py-0.5 rounded-full border border-border-custom/80 shadow-[0_1px_2px_rgba(0,0,0,0.02)] font-mono text-[8px] font-bold text-text-secondary select-none">
    <span class="w-1.5 h-1.5 rounded-full bg-brand-from/80 animate-bulb-pulse"></span>
    <span>MAKER</span>
  </div>

  <!-- Subtle barcode/chip graphic watermark (completely static, low opacity) -->
  <div class="absolute top-4 right-4 opacity-15 dark:opacity-10 select-none z-10">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2">
      <rect x="5" y="5" width="14" height="14" rx="1.5" fill="currentColor" fill-opacity="0.02" />
      <path d="M9 1v4M15 1v4M9 19v4M15 19v4M1 9h4M1 15h4M19 9h4M19 15h4" stroke-linecap="round" />
    </svg>
  </div>

  <!-- Main content wrapper -->
  <div class="relative z-10 flex flex-col justify-between h-full pt-4">
    <!-- Top segment: Avatar & Creator Details -->
    <div>
      <!-- Avatar with clean bezel shadow -->
      <div class="relative w-[72px] h-[72px] mx-auto rounded-2xl p-1 bg-gradient-to-br from-surface-2 to-surface-3 dark:from-surface-3 dark:to-surface border border-border-custom shadow-sm group-hover:border-brand-from/40 transition-all duration-500 overflow-hidden flex items-center justify-center mb-3 select-none">
        <img
          src={maker.avatar}
          alt={maker.name}
          class="w-full h-full rounded-xl object-cover transition-transform duration-700 ease-out group-hover:scale-[1.02]"
        />
      </div>

      <!-- Creator Info -->
      <div class="text-center px-1">
        <h3 class="font-heading text-sm font-extrabold text-text-primary group-hover:text-brand-from transition-colors duration-200 truncate leading-tight">
          {maker.name}
        </h3>
        <p class="font-mono text-[9.5px] text-text-secondary/70 mt-0.5 select-all">
          @{maker.handle}
        </p>
      </div>
    </div>

    <!-- Stats Grid: Cozy digital panels -->
    <div class="grid grid-cols-2 gap-2 text-left my-2 relative z-10">
      <div class="bg-gradient-to-br from-surface-2 to-surface-3/30 dark:from-surface-3/10 dark:to-surface-2/5 border border-border-custom/55 rounded-xl p-2 text-center shadow-inner-custom hover:border-brand-from/15 transition-all duration-300">
        <span class="block text-[8px] font-mono font-bold text-text-secondary/80 uppercase tracking-widest">Launches</span>
        <span class="block font-mono text-xs font-extrabold text-brand-from mt-0.5 tabular-nums">{maker.productsCount}</span>
      </div>

      <div class="bg-gradient-to-br from-surface-2 to-surface-3/30 dark:from-surface-3/10 dark:to-surface-2/5 border border-border-custom/55 rounded-xl p-2 text-center shadow-inner-custom hover:border-brand-from/15 transition-all duration-300">
        <span class="block text-[8px] font-mono font-bold text-text-secondary/80 uppercase tracking-widest">Top Votes</span>
        <span class="block font-mono text-xs font-extrabold text-brand-from mt-0.5 tabular-nums">+{maker.topProductVotes || 0}</span>
      </div>
    </div>

    <!-- Bottom Quote Pitch / Top Launch segment -->
    <div class="mt-auto">
      {#if pitch}
        <!-- Cozy Quote Bubble -->
        <div class="w-full text-left bg-surface-2/50 dark:bg-surface-3/10 border border-border-custom/30 rounded-xl p-2.5 relative transition-all duration-300 group-hover:border-brand-from/10 group-hover:bg-surface-3/10 dark:group-hover:bg-surface-3/15 min-h-[64px] flex flex-col justify-center mb-2.5">
          <!-- Dialogue bubble arrow -->
          <svg viewBox="0 0 16 10" fill="currentColor" class="absolute -top-2 left-[20px] w-3.5 h-2 text-surface-2 dark:text-surface-3 group-hover:text-surface-3/10 dark:group-hover:text-surface-3/15 transition-all duration-300" stroke="currentColor" stroke-width="0.5">
            <path d="M 0 10 L 8 0 L 16 10 Z" class="stroke-border-custom/30 dark:stroke-border-custom/20 group-hover:stroke-brand-from/10 transition-all duration-300" fill="currentColor"/>
          </svg>
          <span class="absolute top-1.5 right-2 text-[12px] font-display text-brand-from/10 font-bold select-none">“</span>
          <span class="absolute top-1.5 left-2.5 text-[7px] font-mono font-extrabold text-brand-from/80 uppercase tracking-widest select-none">Pitch</span>
          <p class="font-body text-[9.5px] text-text-secondary italic mt-1.5 leading-normal line-clamp-3">
            {pitch}
          </p>
        </div>
      {/if}

      <!-- Featured Product callout -->
      {#if maker.topProduct}
        <div class="border-t border-border-custom/40 pt-2 w-full text-center">
          <span class="text-[7.5px] font-bold text-text-secondary/60 uppercase tracking-widest block">Signature Launch</span>
          <span class="text-[11px] font-extrabold text-text-primary mt-0.5 truncate block group-hover:text-brand-from transition-colors duration-200">✨ {maker.topProduct}</span>
        </div>
      {/if}
    </div>
  </div>
</div>
