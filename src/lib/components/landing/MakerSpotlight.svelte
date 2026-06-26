<script lang="ts">
  import { makersStore } from '$lib/stores/makers.svelte';
  import MakerCard from './MakerCard.svelte';
  import Button from '../ui/Button.svelte';

  let scrollContainer = $state<HTMLDivElement | null>(null);

  // Svelte 5 states for Join Card interactive 3D physics
  let j_rx = $state(0);
  let j_ry = $state(0);
  let j_mx = $state(0);
  let j_my = $state(0);
  let j_isHovered = $state(false);
  let joinCardRef = $state<HTMLDivElement | null>(null);

  function scroll(direction: 'left' | 'right') {
    if (scrollContainer) {
      const scrollAmount = 300;
      scrollContainer.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  }

  function handleJoinMouseMove(e: MouseEvent) {
    if (!joinCardRef) return;
    const rect = joinCardRef.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    
    // Very gentle 3D tilt (max 3 degrees) for a subtle natural depth
    const x = (e.clientX - rect.left) / width - 0.5;
    const y = (e.clientY - rect.top) / height - 0.5;
    
    j_rx = -y * 3;
    j_ry = x * 3;
    
    j_mx = e.clientX - rect.left;
    j_my = e.clientY - rect.top;
  }

  function handleJoinMouseEnter() {
    j_isHovered = true;
  }

  function handleJoinMouseLeave() {
    j_isHovered = false;
    j_rx = 0;
    j_ry = 0;
  }
</script>

<section id="makers" class="w-full bg-surface-3 dark:bg-surface border-t border-border-custom/30 py-24 transition-all duration-300 relative overflow-hidden">
  <!-- Soft blueprint graph grid background -->
  <div class="absolute inset-0 blueprint-grid opacity-30 dark:opacity-60 pointer-events-none"></div>
  
  <!-- Vibrant floating soft gradient blobs for deep immersion -->
  <div class="absolute inset-0 pointer-events-none overflow-hidden z-0">
    <div class="absolute -top-[10%] left-[20%] w-[350px] h-[350px] rounded-full bg-brand-from/5 dark:bg-brand-from/10 blur-[100px] animate-glow-slow-1"></div>
    <div class="absolute -bottom-[10%] right-[10%] w-[450px] h-[450px] rounded-full bg-brand-to/5 dark:bg-brand-to/5 blur-[120px] animate-glow-slow-2"></div>
  </div>

  <div class="max-w-7xl mx-auto px-6 relative z-10">
    <!-- Header with controls -->
    <div class="reveal-item flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12 relative z-10">
      <div>
        <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-from/5 border border-brand-from/15 font-mono text-[9px] font-extrabold tracking-widest text-brand-from uppercase shadow-[0_1px_2px_rgba(0,0,0,0.01)] mb-3">
          👑 Maker Hall of Fame
        </span>
        <h2 class="font-heading text-3xl sm:text-4xl font-extrabold text-text-primary tracking-tight">
          Spotlight on the Creators
        </h2>
        <p class="font-body text-xs sm:text-sm text-text-secondary mt-2">
          The innovative builders and developers creating the future of software.
        </p>
      </div>

      <!-- Scroll Buttons & CTA -->
      <div class="flex items-center gap-4">
        <!-- Scroll Nav buttons for Desktop -->
        <div class="hidden sm:flex items-center gap-2">
          <button
            type="button"
            onclick={() => scroll('left')}
            class="w-9 h-9 flex items-center justify-center rounded-[10px] bg-surface border border-border-custom shadow-sm hover:border-brand-from/30 text-text-secondary hover:text-brand-from cursor-pointer active:scale-95 hover:scale-105 transition-all duration-200"
            aria-label="Scroll left"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
          </button>
          <button
            type="button"
            onclick={() => scroll('right')}
            class="w-9 h-9 flex items-center justify-center rounded-[10px] bg-surface border border-border-custom shadow-sm hover:border-brand-from/30 text-text-secondary hover:text-brand-from cursor-pointer active:scale-95 hover:scale-105 transition-all duration-200"
            aria-label="Scroll right"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
          </button>
        </div>

        <Button variant="outline" size="md" href="#join-registry" class="gap-1 shadow-sm hover:border-brand-from hover:bg-brand-from/5 transition-all duration-200">
          Become a maker <span>→</span>
        </Button>
      </div>
    </div>

    <!-- Scrolling List Row -->
    <div
      bind:this={scrollContainer}
      class="flex overflow-x-auto no-scrollbar gap-6 pb-6 scroll-smooth snap-x snap-mandatory relative z-10"
    >
      {#each makersStore.list as maker (maker.id)}
        <MakerCard {maker} />
      {/each}

      <!-- Join Card Placeholder -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        bind:this={joinCardRef}
        onmousemove={handleJoinMouseMove}
        onmouseenter={handleJoinMouseEnter}
        onmouseleave={handleJoinMouseLeave}
        class="group reveal-item flex flex-col items-center justify-center text-center p-6 bg-surface/80 dark:bg-surface-2/80 border-2 border-dashed border-border-custom rounded-[22px] shadow-card hover:shadow-card-hover transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] w-64 h-[380px] flex-shrink-0 relative overflow-hidden select-none snap-start z-10 transform-gpu"
        style="
          transform: perspective(1000px) rotateX({j_rx}deg) rotateY({j_ry}deg);
          --mouse-x: {j_mx}px; --mouse-y: {j_my}px;
        "
      >
        <!-- Extremely Soft Spotlight Cursor Glow -->
        <div 
          class="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500 z-0
                 bg-[radial-gradient(280px_circle_at_var(--mouse-x)_var(--mouse-y),rgba(232,89,60,0.015),transparent)]"
        ></div>

        <div class="relative z-10 flex flex-col items-center justify-center h-full pt-4">
          <!-- Pulsing glowing icon container -->
          <div class="w-16 h-16 rounded-full bg-brand-from/5 dark:bg-brand-from/10 border border-brand-from/10 flex items-center justify-center text-brand-from text-2xl mb-5 group-hover:scale-105 group-hover:bg-brand-from/10 transition-all duration-300 relative">
            ✨
          </div>

          <h3 class="font-heading text-sm font-extrabold text-text-primary tracking-tight">Your Space Awaits</h3>
          <p class="font-body text-xs text-text-secondary leading-relaxed mt-3 max-w-[190px]">
            Launch your project, build your community, and secure a spotlight here.
          </p>

          <Button
            variant="outline"
            size="sm"
            href="#join-registry"
            class="mt-6 border-brand-from/30 text-brand-from hover:bg-brand-from/5 hover:border-brand-from shadow-sm transition-all duration-200 active:scale-95"
          >
            Submit project <span class="ml-0.5">→</span>
          </Button>
        </div>
      </div>
    </div>
  </div>
</section>
