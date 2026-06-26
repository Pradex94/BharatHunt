<script lang="ts">
  import type { Product } from '$lib/data/products';
  import Badge from '../ui/Badge.svelte';
  import UpvoteButton from '../ui/UpvoteButton.svelte';

  let { product }: { product: Product } = $props();
  
  let upvotes = $state(0);
  let hasVoted = $state(false);

  $effect.pre(() => {
    if (upvotes === 0 && !hasVoted) {
      upvotes = product.upvotes;
    }
  });

  let mouseX = $state(0);
  let mouseY = $state(0);
  let cardElement = $state<HTMLDivElement | null>(null);

  // Celebration particle state
  type CelebrationParticle = {
    id: number;
    left: number;
    drift: number;
    scale: number;
    emoji: string;
    spin: number;
    duration: number;
  };
  let hearts = $state<CelebrationParticle[]>([]);
  let heartIdCount = 0;

  const CELEBRATION_EMOJIS = ['❤️', '✨', '🔥', '🚀', '🙌', '🎉', '👍'];

  const tagIconMap: Record<string, string> = {
    'AI': '✨',
    'Productivity': '⚡',
    'Developer Tools': '🛠️',
    'Open Source': '🔓',
    'Design': '🎨'
  };

  function handleMouseMove(e: MouseEvent) {
    if (cardElement) {
      const rect = cardElement.getBoundingClientRect();
      mouseX = e.clientX - rect.left;
      mouseY = e.clientY - rect.top;
    }
  }

  function triggerUpvoteReward() {
    const burst = Array.from({ length: 7 }).map(() => ({
      id: ++heartIdCount,
      left: Math.random() * 25 + 68, // Positioned near the upvote button (right side)
      drift: (Math.random() - 0.5) * 45,
      scale: Math.random() * 0.4 + 0.7,
      emoji: CELEBRATION_EMOJIS[Math.floor(Math.random() * CELEBRATION_EMOJIS.length)],
      spin: (Math.random() - 0.5) * 90,
      duration: Math.random() * 0.3 + 0.8 // 0.8s to 1.1s
    }));
    hearts = [...hearts, ...burst];
  }

  function handleVote(voted: boolean) {
    hasVoted = voted;
    if (voted) {
      triggerUpvoteReward();
    }
  }

  function removeHeart(id: number) {
    hearts = hearts.filter(h => h.id !== id);
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  bind:this={cardElement}
  onmousemove={handleMouseMove}
  class="group relative flex flex-col justify-between h-full bg-surface dark:bg-surface-2 border border-border-custom/40 dark:border-border-custom/30 rounded-[22px] p-5.5 shadow-[0_1.5px_3px_rgba(0,0,0,0.03),_0_4px_16px_rgba(0,0,0,0.02)] ring-1 ring-border-custom/10 hover:border-brand-from/25 dark:hover:border-brand-from/35 hover:ring-4 hover:ring-brand-from/5 dark:hover:ring-brand-from/8 hover:shadow-[0_12px_28px_rgba(232,89,60,0.03)] dark:hover:shadow-[0_12px_28px_rgba(232,89,60,0.06)] transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-1 overflow-hidden"
  style="--mouse-x: {mouseX}px; --mouse-y: {mouseY}px;"
>
  <!-- Dynamic Spotlight Cursor Glow (Drifts behind on hover) -->
  <div 
    class="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500 z-0
           bg-[radial-gradient(320px_circle_at_var(--mouse-x)_var(--mouse-y),rgba(232,89,60,0.03),transparent)]
           dark:bg-[radial-gradient(320px_circle_at_var(--mouse-x)_var(--mouse-y),rgba(232,89,60,0.07),transparent)]"
  ></div>

  <!-- Floating Celebration Particles (Upvote Reward) -->
  {#each hearts as h (h.id)}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <span
      class="animate-celebration-burst absolute pointer-events-none text-xs z-30 select-none"
      style="
        left: {h.left}%;
        bottom: 45px;
        --x-drift: {h.drift}px;
        --spin-deg: {h.spin}deg;
        animation-duration: {h.duration}s;
        transform: scale({h.scale});
      "
      onanimationend={() => removeHeart(h.id)}
    >
      {h.emoji}
    </span>
  {/each}

  <div class="relative z-10">
    <!-- Top Row: Badge + Dynamic Rank Badges for Top 3 -->
    <div class="flex items-center justify-between mb-4">
      <!-- Feature/Rank Badges -->
      <div class="flex gap-1.5">
        {#if product.isNew}
          <Badge variant="primary">New</Badge>
        {/if}
        {#if product.featured}
          <span class="px-2 py-0.5 rounded-full border border-amber-500/20 bg-amber-500/5 text-[9px] font-mono font-extrabold uppercase tracking-wide text-brand-to select-none">
            Featured
          </span>
        {/if}
      </div>

      <!-- Consistent, high-contrast dynamic rank bubble for top 3 -->
      {#if product.id === 'p1'}
        <span class="px-2 py-0.5 rounded border border-amber-500/30 bg-amber-500/10 dark:bg-amber-500/5 text-amber-600 dark:text-amber-400 font-mono text-[9px] font-extrabold uppercase tracking-wider select-none animate-pulse">
          👑 #01 PICK
        </span>
      {:else if product.id === 'p2'}
        <span class="px-2 py-0.5 rounded border border-emerald-500/30 bg-emerald-500/10 dark:bg-emerald-500/5 text-emerald-600 dark:text-emerald-400 font-mono text-[9px] font-extrabold uppercase tracking-wider select-none">
          🚀 #02 PICK
        </span>
      {:else if product.id === 'p3'}
        <span class="px-2 py-0.5 rounded border border-rose-500/30 bg-rose-500/10 dark:bg-rose-500/5 text-rose-600 dark:text-rose-400 font-mono text-[9px] font-extrabold uppercase tracking-wider select-none">
          🔥 #03 PICK
        </span>
      {:else}
        <span class="font-mono text-[9px] font-extrabold text-text-secondary/60 uppercase tracking-wider">
          #{product.id.replace('p', '0')} PICK
        </span>
      {/if}
    </div>

    <!-- Header Block: Icon + Avatar overlap + Metadata -->
    <div class="flex items-center gap-4 mb-4 text-left">
      <!-- Human overlapping avatar structure -->
      <div class="relative flex-shrink-0 select-none">
        <!-- Main Product Icon: 3D Squircle shape with internal bevel shadow -->
        <div class="w-12 h-12 rounded-[15px] bg-gradient-to-br {product.iconBg} flex items-center justify-center font-heading font-extrabold text-white text-base shadow-[inset_0_1.5px_0_rgba(255,255,255,0.4),_0_2.5px_6px_rgba(0,0,0,0.12)] border border-white/10 relative overflow-hidden group-hover:scale-105 group-hover:rotate-2 transition-all duration-300">
          <span class="flex items-center">
            {product.iconText}
            <!-- Rank #1 (Zenith Editor): Typing cursor blink -->
            {#if product.id === 'p1'}
              <span class="animate-cursor-blink ml-0.5 font-mono font-normal text-white/80">|</span>
            {/if}
          </span>

          <!-- Rank #2 (PulseFlow): Mini wave ripple overlay -->
          {#if product.id === 'p2'}
            <div class="absolute bottom-0 left-0 right-0 h-4 overflow-hidden pointer-events-none opacity-20 group-hover:opacity-75 transition-opacity duration-300">
              <svg viewBox="0 0 100 40" preserveAspectRatio="none" class="w-full h-full text-white fill-none stroke-current stroke-[3.5]">
                <path d="M0,20 C30,40 20,0 50,20 C80,40 70,0 100,20" class="animate-mini-wave" />
              </svg>
            </div>
          {/if}

          <!-- Rank #3 (SpectraDB): Expanding radar pulse -->
          {#if product.id === 'p3'}
            <div class="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
              <div class="w-12 h-12 rounded-[15px] bg-white/20 animate-radar-pulse opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            </div>
          {/if}

          <!-- Diagonal gloss sweep -->
          <div class="absolute inset-0 bg-gradient-to-tr from-transparent via-white/12 to-transparent opacity-0 group-hover:opacity-100 -translate-x-full group-hover:translate-x-full transition-all duration-1000 ease-in-out pointer-events-none"></div>
        </div>
        <!-- Maker Avatar Bubble overlapping bottom right -->
        <div class="absolute -bottom-1.5 -right-1.5 w-6 h-6 rounded-full border-2 border-surface dark:border-surface-2 shadow-sm overflow-hidden group-hover:scale-110 group-hover:rotate-6 transition-all duration-300">
          <img src={product.maker.avatar} alt={product.maker.name} class="w-full h-full object-cover" />
        </div>
      </div>

      <!-- Product details -->
      <div class="flex flex-col">
        <h3 class="font-heading text-[14.5px] font-extrabold text-text-primary group-hover:text-brand-from transition-colors duration-200 leading-tight flex items-center">
          {product.name}
          <!-- Rank #1 (Zenith Editor): Blinking underscore type cursor next to title -->
          {#if product.id === 'p1'}
            <span class="font-mono font-normal ml-0.5 text-brand-from animate-cursor-blink opacity-0 group-hover:opacity-100 transition-opacity duration-200">_</span>
          {/if}
        </h3>
        <p class="font-body text-[10px] text-text-secondary mt-0.5">
          crafted by <span class="font-semibold text-text-primary">@{product.maker.handle}</span>
        </p>
      </div>
    </div>

    <!-- Main Tagline -->
    <p class="font-body text-[12px] text-text-secondary leading-relaxed text-left mb-4">
      {product.tagline}
    </p>

    <!-- Warm speech bubble quote block (Human maker pitch) -->
    {#if product.makerPitch}
      <div class="mt-5 px-3.5 py-3 rounded-2xl bg-gradient-to-br from-surface-2 to-surface-3/50 dark:from-surface-3/20 dark:to-surface-2/10 border border-border-custom/40 dark:border-border-custom/25 group-hover:border-brand-from/15 group-hover:shadow-[0_2px_12px_rgba(232,89,60,0.01)] text-left relative transition-all duration-300">
        <!-- SVG Dialogue bubble pointer tail -->
        <svg viewBox="0 0 16 10" fill="currentColor" class="absolute -top-2.5 left-[22px] w-4.5 h-3 text-surface-2 dark:text-surface-3 group-hover:text-surface-3 dark:group-hover:text-surface-3/20 transition-all duration-300" stroke="currentColor" stroke-width="1">
          <path d="M 0 10 L 8 0 L 16 10 Z" class="stroke-border-custom/40 dark:stroke-border-custom/25 group-hover:stroke-brand-from/15 transition-all duration-300" fill="currentColor"/>
        </svg>

        <span class="absolute top-2 right-3.5 text-[14px] font-display text-brand-from/20 font-bold select-none">“</span>
        <span class="absolute top-2 left-3.5 text-[8px] font-mono font-extrabold text-brand-from uppercase tracking-widest select-none">
          Maker Pitch
        </span>
        <p class="font-body text-[10.5px] text-text-secondary italic mt-2.5 leading-relaxed">
          {product.makerPitch}
        </p>
      </div>
    {/if}
  </div>

  <!-- Bottom Action & Tags Row -->
  <div class="relative z-10 flex items-center justify-between mt-5 pt-3.5 border-t border-border-custom/40">
    <!-- Category badges with micro-icons -->
    <div class="flex flex-wrap gap-1.5 max-w-[55%]">
      {#each product.tags.slice(0, 2) as tag}
        <span class="px-2.5 py-0.5 rounded-full bg-surface-2 dark:bg-surface border border-border-custom/60 text-[9px] font-mono font-bold text-text-secondary select-none flex items-center gap-1">
          <span class="text-[10px]">{tagIconMap[tag] || '🏷️'}</span>
          <span>{tag}</span>
        </span>
      {/each}
    </div>

    <!-- Actions block: Comments + Upvote button -->
    <div class="flex items-center gap-3">
      <!-- Comment count click trigger -->
      <a
        href="#comments"
        class="flex items-center gap-1 font-mono text-[11px] text-text-secondary hover:text-brand-from transition-colors duration-200 py-1"
        aria-label="View comments"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5 transition-transform duration-300 group-hover:rotate-6"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        <span class="font-bold">{product.comments}</span>
      </a>

      <!-- Premium Skeuomorphic Upvote button -->
      <UpvoteButton bind:count={upvotes} bind:active={hasVoted} onvote={handleVote} />
    </div>
  </div>
</div>

<style>
  /* Rank #1: terminal cursor blink keyframes */
  @keyframes cursor-blink {
    0%, 100% { opacity: 0; }
    50% { opacity: 1; }
  }
  .animate-cursor-blink {
    animation: cursor-blink 0.9s step-end infinite;
  }

  /* Rank #2: micro-wave wave pulse animation */
  @keyframes mini-wave-bob {
    0%, 100% { transform: scaleY(1) translateY(0); }
    50% { transform: scaleY(1.35) translateY(-1.5px); }
  }
  .animate-mini-wave {
    animation: mini-wave-bob 1.6s ease-in-out infinite;
  }

  /* Rank #3: Expanding sonar radar expansion ring keyframes */
  @keyframes radar-pulse {
    0% { transform: scale(1); opacity: 0.8; }
    100% { transform: scale(1.4); opacity: 0; }
  }
  .animate-radar-pulse {
    animation: radar-pulse 1.3s cubic-bezier(0.16, 1, 0.3, 1) infinite;
  }

  /* Premium organic drifting celebration reward keyframes */
  @keyframes celebration-float-up {
    0% {
      transform: translate3d(0, 0, 0) scale(0.65) rotate(0deg);
      opacity: 0;
    }
    15% {
      opacity: 1;
    }
    85% {
      opacity: 1;
    }
    100% {
      transform: translate3d(var(--x-drift), -80px, 0) scale(1.15) rotate(var(--spin-deg));
      opacity: 0;
    }
  }

  .animate-celebration-burst {
    animation: celebration-float-up var(--duration, 0.9s) cubic-bezier(0.25, 1, 0.5, 1) forwards;
  }
</style>
