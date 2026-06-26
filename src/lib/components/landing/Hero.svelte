<script lang="ts">
  import { onMount } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import Button from '../ui/Button.svelte';

  let mounted = $state(false);

  onMount(() => {
    mounted = true;
  });
</script>

<section class="relative min-h-[75vh] pt-32 pb-28 flex flex-col items-center justify-center overflow-hidden text-center transition-all duration-300">
  <!-- Warm & Welcoming Organic Radial Glow Background with Animated Drift -->
  <div class="absolute inset-0 pointer-events-none z-0">
    <!-- Top-Left Warm Ember Gradient Bloom -->
    <div class="absolute top-[5%] left-[15%] w-[550px] sm:w-[650px] h-[550px] sm:h-[650px] rounded-full bg-gradient-to-tr from-brand-from/8 via-rose-500/5 to-transparent dark:from-brand-from/12 dark:via-rose-500/8 dark:to-transparent blur-[130px] sm:blur-[150px] animate-glow-slow-1 opacity-90"></div>
    
    <!-- Bottom-Right Cozy Golden Amber Bloom -->
    <div class="absolute bottom-[10%] right-[10%] w-[500px] sm:w-[600px] h-[500px] sm:h-[600px] rounded-full bg-gradient-to-br from-brand-to/6 via-amber-400/4 to-transparent dark:from-brand-to/10 dark:via-amber-400/6 dark:to-transparent blur-[110px] sm:blur-[130px] animate-glow-slow-2 opacity-95"></div>
    
    <!-- Centered Ambient Sunset Blush Bloom -->
    <div class="absolute top-[20%] left-1/2 -translate-x-1/2 w-[700px] sm:w-[850px] h-[400px] sm:h-[450px] rounded-full bg-gradient-to-r from-orange-400/5 via-rose-400/5 to-amber-300/3 dark:from-orange-500/8 dark:via-rose-500/8 dark:to-amber-400/4 blur-[140px] sm:blur-[160px] animate-glow-slow-3 opacity-80"></div>
  </div>

  <div class="max-w-5xl mx-auto px-6 flex flex-col items-center gap-8 relative z-10 w-full">
    {#if mounted}
      <!-- Premium Glassmorphic Announcement Badge with double borders, glowing spark, and hover state -->
      <a
        href="#products"
        in:fly={{ y: 12, duration: 600 }}
        class="group relative inline-flex items-center gap-2.5 p-1 pr-4 rounded-full 
               bg-gradient-to-r from-surface-3/80 to-surface-2/80 dark:from-surface-3/35 dark:to-surface-2/25
               backdrop-blur-md border border-brand-from/15 dark:border-brand-from/25
               shadow-[0_1px_2px_rgba(0,0,0,0.02),_inset_0_1px_0_rgba(255,255,255,0.6)]
               dark:shadow-[0_1px_2px_rgba(0,0,0,0.15),_inset_0_1px_0_rgba(255,255,255,0.05)]
               hover:border-brand-from/40 hover:shadow-[0_6px_20px_rgba(232,89,60,0.08),_inset_0_1px_0_rgba(255,255,255,0.8)]
               dark:hover:shadow-[0_6px_20px_rgba(232,89,60,0.15),_inset_0_1px_0_rgba(255,255,255,0.1)]
               transition-all duration-300 select-none cursor-pointer"
      >
        <!-- Outer Glowing Accent Ring on Hover -->
        <span class="absolute inset-0 rounded-full border border-brand-to/0 group-hover:border-brand-to/25 transition-colors duration-300 pointer-events-none"></span>

        <!-- Left capsule badge: High-end monospaced text with linear gradient accent -->
        <span class="relative flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface dark:bg-surface-2 border border-brand-from/10 dark:border-brand-from/20 shadow-[0_1px_2px_rgba(0,0,0,0.03)] overflow-hidden">
          <!-- Small warm pulse dot -->
          <span class="relative flex h-2 w-2">
            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-from opacity-75"></span>
            <span class="relative inline-flex rounded-full h-2 w-2 bg-gradient-to-r from-brand-from to-brand-to"></span>
          </span>
          <span class="font-mono text-[10px] font-extrabold tracking-wider bg-gradient-to-r from-brand-from to-brand-to bg-clip-text text-transparent uppercase">
            TechTank 1.0
          </span>
        </span>
        
        <!-- Right side message -->
        <span class="text-text-secondary group-hover:text-text-primary text-[11px] font-bold flex items-center gap-1 transition-colors duration-200">
          Discover beautiful software that matters
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="w-3.5 h-3.5 text-brand-from group-hover:translate-x-0.5 transition-transform duration-200">
            <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
          </svg>
        </span>
      </a>

      <!-- Headline (Centered with Blur Reveal) -->
      <h1 class="animate-blur-reveal-1 font-display text-5xl sm:text-6xl md:text-7xl font-normal leading-[1.08] text-text-primary italic tracking-tight max-w-4xl">
        The launchpad for <br class="hidden sm:inline" />
        <span class="bg-gradient-to-r from-brand-from to-brand-to bg-clip-text text-transparent font-heading font-extrabold not-italic tracking-normal">
          software that matters
        </span>
      </h1>

      <!-- Subheadline (Centered with Blur Reveal - Reduced font size) -->
      <p class="animate-blur-reveal-2 font-body text-xs sm:text-[13px] md:text-sm text-text-secondary leading-relaxed max-w-2xl">
        TechTank is a warm, community-driven platform where developers, designers, and creators showcase beautiful, premium products and vote on what matters.
      </p>

      <!-- Actions (Centered with Blur Reveal - Clean outline borders) -->
      <div class="animate-blur-reveal-3 flex flex-col sm:flex-row items-center justify-center gap-4 w-full sm:w-auto">
        <Button variant="primary" size="lg" href="#products" class="w-full sm:w-auto">
          Browse today's products
        </Button>
        <Button variant="outline" size="lg" href="#newsletter" class="w-full sm:w-auto gap-1">
          Submit your product <span>→</span>
        </Button>
      </div>

      <!-- Social Proof Strip (Centered) -->
      <div in:fade={{ duration: 600, delay: 600 }} class="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4 border-t border-border-custom/50 w-full max-w-md mt-2">
        <!-- Avatars Stack -->
        <div class="flex -space-x-2.5">
          <img class="w-8 h-8 rounded-full border-2 border-surface shadow-sm object-cover" src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=80&h=80&q=80" alt="User Avatar" />
          <img class="w-8 h-8 rounded-full border-2 border-surface shadow-sm object-cover" src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=80&h=80&q=80" alt="User Avatar" />
          <img class="w-8 h-8 rounded-full border-2 border-surface shadow-sm object-cover" src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=80&h=80&q=80" alt="User Avatar" />
          <img class="w-8 h-8 rounded-full border-2 border-surface shadow-sm object-cover" src="https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=80&h=80&q=80" alt="User Avatar" />
        </div>
        <span class="font-body text-sm text-text-secondary font-medium">
          Join <span class="text-text-primary font-bold">4,200+</span> makers &middot; <span class="text-text-primary font-bold">1,800+</span> launched
        </span>
      </div>
    {/if}
  </div>

  <!-- Bottom Fading Blur Transition Layer to blend seamlessly with CreativeBlueprintGrid -->
  <div class="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-surface-2 to-transparent backdrop-blur-[3px] pointer-events-none z-20"></div>
</section>
