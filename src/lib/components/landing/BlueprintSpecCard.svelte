<script lang="ts">
  import type { Product } from '$lib/data/products';
  import Badge from '../ui/Badge.svelte';
  import { onMount } from 'svelte';

  let { product }: { product: Product } = $props();

  // Local card reference for coordinates & tilt calculations
  let cardRef = $state<HTMLDivElement | null>(null);
  let rx = $state(0);
  let ry = $state(0);
  let mx = $state(0);
  let my = $state(0);
  let isHovered = $state(false);

  // Floating particles state
  type Particle = {
    id: number;
    text: string;
    left: number;
    drift: number;
    scale: number;
  };
  let particles = $state<Particle[]>([]);
  let particleId = 0;

  const SYNTAX_SNIPPETS = [
    'const launch = true;',
    'npm run dev',
    '<div>',
    'fn()',
    'v-4',
    'flex gap-4',
    'rounded-full',
    'rgba(232,89,60)',
    'import { svelte }',
    'shadow-card',
    'grid grid-cols-3'
  ];

  let particleInterval: any;

  $effect(() => {
    if (isHovered) {
      particleInterval = setInterval(() => {
        if (particles.length < 6) {
          const text = SYNTAX_SNIPPETS[Math.floor(Math.random() * SYNTAX_SNIPPETS.length)];
          const left = Math.random() * 80 + 10;
          const drift = (Math.random() - 0.5) * 60;
          const scale = Math.random() * 0.2 + 0.85;
          particles = [...particles, { id: ++particleId, text, left, drift, scale }];
        }
      }, 500);
    } else {
      clearInterval(particleInterval);
      particles = [];
    }
    return () => {
      clearInterval(particleInterval);
    };
  });

  function removeParticle(id: number) {
    particles = particles.filter((p) => p.id !== id);
  }

  function handleMouseMove(e: MouseEvent) {
    if (!cardRef) return;
    const rect = cardRef.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    
    // Normalized position from -0.5 to 0.5
    const x = (e.clientX - rect.left) / width - 0.5;
    const y = (e.clientY - rect.top) / height - 0.5;
    
    // Smooth 3D tilt angles (max 12 deg)
    rx = -y * 12;
    ry = x * 12;
    
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

  // --- CARD 1 SPECIFIC: Zenith Editor (Contrast Tuning Dial) ---
  let dialValue = $state(50); // 0 to 100
  let isDraggingDial = $state(false);

  function handleDialStart(e: MouseEvent) {
    isDraggingDial = true;
    e.preventDefault();
  }

  function handleDialMove(e: MouseEvent) {
    if (!isDraggingDial || !cardRef) return;
    const rect = cardRef.getBoundingClientRect();
    // Approximate coordinate from dial center (let's assume it is around bottom center)
    const dialCenterX = rect.left + rect.width * 0.75;
    const dialCenterY = rect.top + rect.height * 0.78;
    const angleRad = Math.atan2(e.clientY - dialCenterY, e.clientX - dialCenterX);
    let angleDeg = angleRad * (180 / Math.PI) + 90; // offset so 0 is up
    if (angleDeg < 0) angleDeg += 360;
    
    // Convert angle (0 to 360) to dial value (0 to 100)
    dialValue = Math.round((angleDeg / 360) * 100);
  }

  function handleDialEnd() {
    isDraggingDial = false;
  }

  onMount(() => {
    const handleGlobalMouseUp = () => {
      isDraggingDial = false;
    };
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => {
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  });

  // --- CARD 2 SPECIFIC: PulseFlow (Latency Wave speed range slider) ---
  let latencyValue = $state(2.4); // 0.2ms to 10.0ms
  let waveOffset = $state(0);

  $effect(() => {
    let animationFrame: number;
    const updateWave = () => {
      // Frequency based on latency (low latency = faster frequency/animation)
      const speed = (10.2 - latencyValue) * 0.08;
      waveOffset += speed;
      animationFrame = requestAnimationFrame(updateWave);
    };
    animationFrame = requestAnimationFrame(updateWave);
    return () => {
      cancelAnimationFrame(animationFrame);
    };
  });

  // Generate SVG path for pulsing wave
  let wavePath = $derived.by(() => {
    let points = [];
    const amplitude = 12;
    const wavelength = 28;
    for (let x = 0; x <= 160; x += 4) {
      const y = Math.sin((x + waveOffset) / wavelength * Math.PI * 2) * amplitude;
      points.push(`${x},${y + 18}`);
    }
    return `M 0,18 L ` + points.join(' L ');
  });

  // --- CARD 3 SPECIFIC: SpectraDB (Database Node Toggle switch) ---
  let nodeSwitchActive = $state(true);

  // --- CARD 4 SPECIFIC: Draftboard (8x8 pixel art board hover-to-draw) ---
  let pixelGrid = $state(Array(64).fill(false));

  function handlePixelHover(index: number) {
    pixelGrid[index] = !pixelGrid[index];
  }

  function clearPixelGrid() {
    pixelGrid = Array(64).fill(false);
  }

  // --- CARD 5 SPECIFIC: KubeLens (Terminal simulator widget) ---
  let logs = $state<string[]>([
    'KUBELENS_INIT: COMPLETE',
    'CONNECTING TO CLUSTER...'
  ]);
  
  $effect(() => {
    let logInterval: any;
    if (isHovered) {
      logInterval = setInterval(() => {
        const statuses = [
          'POD_A: active [health: 100%]',
          'CLUSTER: synced (60fps)',
          'FPS STABILITY: optimal',
          'VITE COMPILER: active',
          'TRAFFIC: routing through edge',
          'DB NODE_1: responsive',
          'RE-SCALING PODS... DONE'
        ];
        const newLog = statuses[Math.floor(Math.random() * statuses.length)];
        logs = [...logs.slice(-3), newLog]; // Keep last 4 logs
      }, 1500);
    } else {
      clearInterval(logInterval);
      logs = [
        'KUBELENS_INIT: COMPLETE',
        'CONNECTING TO CLUSTER...'
      ];
    }
    return () => {
      clearInterval(logInterval);
    };
  });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  bind:this={cardRef}
  onmousemove={handleMouseMove}
  onmousemovecapture={handleDialMove}
  onmouseenter={handleMouseEnter}
  onmouseleave={handleMouseLeave}
  class="relative flex flex-col justify-between w-[335px] h-[360px] bg-surface dark:bg-surface-2 border border-border-custom/80 dark:border-border-custom/50 rounded-2xl p-5 shadow-card hover:shadow-[0_16px_40px_rgba(232,89,60,0.12)] transition-all duration-500 ease-out select-none cursor-pointer overflow-hidden transform-gpu"
  style="
    transform: perspective(1000px) rotateX({rx}deg) rotateY({ry}deg) scale({isHovered ? 1.025 : 1});
    --mx: {mx}px; --my: {my}px;
  "
>
  <!-- Background Blueprint Graph Grid (Appears on Hover) -->
  <div 
    class="absolute inset-0 blueprint-grid blueprint-grid-large transition-all duration-500 pointer-events-none z-0"
    style="opacity: {isHovered ? 1 : 0};"
  ></div>

  <!-- Ambient Hue Shift Overlays based on Dial Value (Zenith Editor) -->
  {#if product.id === 'p1' && isHovered}
    <div 
      class="absolute inset-0 pointer-events-none z-0 mix-blend-overlay transition-opacity duration-300"
      style="
        background: radial-gradient(circle at {mx}px {my}px, hsla({dialValue * 3.6}, 80%, 65%, 0.14) 0%, transparent 75%);
      "
    ></div>
  {/if}

  <!-- Moving Laser Outline SVG (Appears on Hover) -->
  {#if isHovered}
    <svg class="absolute inset-0 w-full h-full pointer-events-none z-10">
      <rect 
        x="1.5" y="1.5" width="100%" height="100%" rx="14" fill="none"
        class="stroke-brand-from/40 dark:stroke-brand-from/60 stroke-2 animate-laser-stroke"
      />
    </svg>
  {/if}

  <!-- Blueprint Crosshairs Spec Guides (Appears on Hover) -->
  <div 
    class="absolute inset-0 pointer-events-none z-10 transition-opacity duration-500 font-mono text-[9px] text-brand-from/45 dark:text-brand-from/60 select-none"
    style="opacity: {isHovered ? 1 : 0};"
  >
    <!-- Top-Left Crosshair -->
    <span class="absolute top-2.5 left-2.5">+ [0,0]</span>
    <!-- Bottom-Right Crosshair -->
    <span class="absolute bottom-2.5 right-2.5">[340,360] +</span>
    <!-- Dimensions -->
    <span class="absolute top-2.5 right-2.5">W: 340px</span>
    <span class="absolute bottom-2.5 left-2.5">H: 360px</span>
    <!-- Real-time Coordinate -->
    <span class="absolute top-1/2 left-4 -translate-y-1/2 rotate-90 origin-left tracking-wide">
      TILT: {rx.toFixed(1)}&deg; &middot; {ry.toFixed(1)}&deg;
    </span>
    <span class="absolute top-1/2 right-4 -translate-y-1/2 -rotate-90 origin-right tracking-wide">
      X: {mx}px &middot; Y: {my}px
    </span>
  </div>

  <!-- Floating Monospace Code Particles -->
  {#if isHovered}
    {#each particles as p (p.id)}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <span
        class="animate-code-particle font-mono text-[9px] text-brand-from/50 dark:text-brand-from/75 z-20 pointer-events-none whitespace-nowrap"
        style="
          left: {p.left}%;
          --x-drift: {p.drift}px;
          transform: scale({p.scale});
        "
        onanimationend={() => removeParticle(p.id)}
      >
        {p.text}
      </span>
    {/each}
  {/if}

  <!-- CARD CORE CONTENT WRAPPER -->
  <div class="relative z-10 flex flex-col justify-between h-full pointer-events-auto">
    <!-- Header Block -->
    <div>
      <div class="flex items-center justify-between mb-3">
        <!-- Icon & Title -->
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-gradient-to-br {product.iconBg} flex items-center justify-center font-heading font-extrabold text-white text-sm shadow-md">
            {product.iconText}
          </div>
          <div class="text-left">
            <h4 class="font-heading text-sm font-extrabold text-text-primary leading-tight flex items-center gap-1.5">
              {product.name}
            </h4>
            <p class="font-body text-[10px] text-text-secondary">by @{product.maker.handle}</p>
          </div>
        </div>

        <!-- Custom Spec Tag -->
        <span class="font-mono text-[9px] font-bold text-brand-from border border-brand-from/20 rounded px-1.5 py-0.5 bg-brand-from/5">
          {#if product.id === 'p1'}
            CRAFT_SPEC: 01
          {:else}
            SPEC_SYS: {product.iconText.toUpperCase()}
          {/if}
        </span>
      </div>

      <p class="font-body text-xs text-text-secondary leading-normal text-left mb-4">
        {product.tagline}
      </p>
    </div>

    <!-- MIDDLE INTERACTIVE MECHANICS ROW -->
    <div class="my-3 py-3 border-y border-border-custom/50 bg-surface-2/40 dark:bg-surface-3/15 rounded-xl relative overflow-hidden flex flex-col justify-center min-h-[90px]">
      
      <!-- CARD 1: Zenith Editor (Mechanical rotating focus dial) -->
      {#if product.id === 'p1'}
        <div class="flex items-center justify-between px-3">
          <div class="text-left font-mono text-[10px]">
            <p class="text-text-secondary font-bold uppercase tracking-wider">Contrast Tuner</p>
            <p class="text-brand-from font-extrabold mt-1 text-xs">VAL: {dialValue}%</p>
            <p class="text-[8px] text-text-secondary/60 mt-0.5">Drag dial to alter hue</p>
          </div>
          <!-- Rotatable Dial Knob (Click-drag & wheel supported) -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div 
            class="relative w-14 h-14 rounded-full bg-gradient-to-br from-surface-3 to-surface border-2 border-border-custom flex items-center justify-center shadow-card cursor-pointer select-none"
            onmousedown={handleDialStart}
            style="transform: rotate({dialValue * 3.6}deg);"
          >
            <!-- Center physical indent mark -->
            <div class="w-1.5 h-1.5 rounded-full bg-brand-from shadow-inner-custom"></div>
            <!-- Radial tick indicator -->
            <div class="absolute top-1 left-1/2 -translate-x-1/2 w-0.5 h-2 bg-brand-from rounded"></div>
          </div>
        </div>

      <!-- CARD 2: PulseFlow (Skeuomorphic edge latency waveform slider) -->
      {:else}
        {#if product.id === 'p2'}
          <div class="flex flex-col gap-2 px-3">
            <div class="flex items-center justify-between font-mono text-[10px]">
              <span class="text-text-secondary font-bold uppercase">Edge Latency Tuner</span>
              <span class="text-emerald-500 font-extrabold text-xs">{latencyValue.toFixed(1)}ms</span>
            </div>
            
            <div class="flex items-center gap-3">
              <!-- Live Waveform Visualization Canvas -->
              <div class="relative w-28 h-9 bg-surface-3 dark:bg-surface border border-border-custom rounded-lg overflow-hidden shadow-inner-custom">
                <svg class="w-full h-full">
                  <!-- Animated wave path -->
                  <path 
                    d={wavePath} 
                    fill="none" 
                    class="stroke-emerald-500 stroke-[1.5]"
                  />
                </svg>
              </div>

              <!-- Custom Bevel slider track -->
              <input 
                type="range" 
                min="0.2" 
                max="10.0" 
                step="0.1" 
                bind:value={latencyValue}
                class="flex-1 h-2 bg-surface-3 dark:bg-surface border border-border-custom rounded-lg appearance-none cursor-pointer outline-none accent-emerald-500"
              />
            </div>
          </div>

        <!-- CARD 3: SpectraDB (Tactile Node Toggle Click Switch) -->
        {:else}
          {#if product.id === 'p3'}
            <div class="flex items-center justify-between px-3">
              <div class="text-left font-mono text-[10px]">
                <span class="text-text-secondary font-bold uppercase block">Cluster Node Switch</span>
                <span class="text-[8px] text-text-secondary/60 mt-0.5 block">Toggle to map database threads</span>
                <div class="flex items-center gap-1.5 mt-2">
                  <span class="w-2 h-2 rounded-full {nodeSwitchActive ? 'bg-amber-500 animate-bulb-pulse' : 'bg-text-secondary/30'}"></span>
                  <span class="{nodeSwitchActive ? 'text-amber-500 font-extrabold' : 'text-text-secondary/50 font-bold'}">
                    {nodeSwitchActive ? 'NODES_LIVE (512)' : 'STANDBY_MODE'}
                  </span>
                </div>
              </div>

              <!-- Physical Toggle Switch -->
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div 
                onclick={() => nodeSwitchActive = !nodeSwitchActive}
                class="w-14 h-8 rounded-full border border-border-custom bg-surface-3 dark:bg-surface flex items-center p-0.5 cursor-pointer shadow-inner-custom transition-all duration-300 relative"
                style="background-color: {nodeSwitchActive ? 'var(--surface-3)' : 'transparent'};"
              >
                <!-- Switch Thumb -->
                <div 
                  class="w-7 h-7 rounded-full bg-gradient-to-br {nodeSwitchActive ? 'from-amber-400 to-rose-500 shadow-md' : 'from-surface-3 to-surface-2 border border-border-custom shadow-sm'} transition-all duration-300 flex items-center justify-center font-mono text-[8px] font-bold text-white uppercase select-none"
                  style="transform: translateX({nodeSwitchActive ? '22px' : '0px'});"
                >
                  {nodeSwitchActive ? 'ON' : 'OFF'}
                </div>
              </div>
            </div>

          <!-- CARD 4: Draftboard (8x8 pixel drawing canvas grid) -->
          {:else}
            {#if product.id === 'p4'}
              <div class="flex items-center justify-between px-3 gap-2">
                <div class="text-left font-mono text-[10px]">
                  <span class="text-text-secondary font-bold uppercase block">Interactive Canvas</span>
                  <span class="text-[8px] text-text-secondary/60 block mt-0.5">Hover grid to draw pixel art</span>
                  <button 
                    onclick={clearPixelGrid}
                    class="mt-2.5 px-2 py-0.5 rounded border border-border-custom bg-surface text-[8px] font-bold text-brand-from hover:bg-brand-from/5 transition-colors cursor-pointer"
                  >
                    Clear Art
                  </button>
                </div>

                <!-- 8x8 Drawing Grid -->
                <div class="grid grid-cols-8 gap-0.5 p-1 bg-surface-3 dark:bg-surface border border-border-custom rounded-lg shadow-inner-custom">
                  {#each pixelGrid as pixel, idx}
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <div 
                      onmouseenter={() => handlePixelHover(idx)}
                      class="w-2.5 h-2.5 rounded-[1.5px] transition-all duration-100 {pixel ? 'bg-gradient-to-r from-brand-from to-brand-to scale-95 shadow-sm' : 'bg-text-secondary/10 dark:bg-text-secondary/5 hover:bg-brand-from/20'}"
                    ></div>
                  {/each}
                </div>
              </div>

            <!-- CARD 5: KubeLens (Terminal simulator pod outputs) -->
            {:else}
              <div class="px-3 flex flex-col gap-1 text-left font-mono text-[9px]">
                <div class="flex items-center justify-between text-text-secondary font-bold border-b border-border-custom/30 pb-0.5 mb-1 select-none">
                  <span>LOGS CONSOLE</span>
                  <span class="text-brand-from animate-pulse">&bull; LIVE</span>
                </div>
                <div class="space-y-0.5 text-text-primary/80 leading-normal">
                  {#each logs as log}
                    <div class="truncate">
                      <span class="text-brand-from/70">&gt;</span> {log}
                    </div>
                  {/each}
                </div>
              </div>
            {/if}
          {/if}
        {/if}
      {/if}

    </div>

    <!-- BOTTOM ROW: Upvote repr + tags -->
    <div class="flex items-center justify-between pt-3.5 border-t border-border-custom/50">
      <!-- Tags -->
      <div class="flex flex-wrap gap-1.5 max-w-[55%]">
        {#each product.tags as tag}
          <span class="px-2 py-0.5 rounded-full bg-surface-3 dark:bg-surface border border-border-custom text-[9px] font-mono text-text-secondary select-none">
            {tag}
          </span>
        {/each}
      </div>

      <!-- Upvote Counter representation -->
      <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-surface border border-border-custom dark:bg-surface-3 shadow-inner-custom hover:border-brand-from/40 transition-colors">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" class="w-3 h-3 text-brand-from"><path d="m18 15-6-6-6 6"/></svg>
        <span class="font-mono text-[10px] font-extrabold text-text-primary">{product.upvotes}</span>
      </div>
    </div>
  </div>
</div>

<style>
  /* Custom slider styling logic */
  input[type=range]::-webkit-slider-thumb {
    height: 16px;
    width: 16px;
    border-radius: 9999px;
    background: linear-gradient(135deg, var(--brand-from), var(--brand-to));
    cursor: pointer;
    margin-top: -4px;
    border: 2px solid var(--surface);
    box-shadow: 0 1px 3px rgba(0,0,0,0.15);
    transition: transform 0.15s ease;
  }
  input[type=range]::-webkit-slider-thumb:hover {
    transform: scale(1.15);
  }
  input[type=range]::-webkit-slider-runnable-track {
    width: 100%;
    height: 8px;
    cursor: pointer;
    background: var(--surface-3);
    border-radius: 9999px;
    border: 1px solid var(--border);
  }
  :global(.dark) input[type=range]::-webkit-slider-runnable-track {
    background: var(--surface);
  }
</style>
