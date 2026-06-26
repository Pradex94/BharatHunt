<script lang="ts">
  import { makersStore } from '$lib/stores/makers.svelte';
  import type { Maker } from '$lib/data/products';
  import Button from '../ui/Button.svelte';

  // Input states
  let name = $state('');
  let email = $state('');
  let platformUrl = $state('');
  let isSubmitting = $state(false);
  let isSubmitted = $state(false);
  let errorMessage = $state('');

  // Encryption logs simulation state
  let encryptProgress = $state(0);
  let encryptLogs: string[] = $state([]);
  let registeredMaker: Maker | null = $state(null);
  let ticketNo = $state('');
  let secureHash = $state('');

  // 3D perspective variables for mainframe card container
  let rx = $state(0);
  let ry = $state(0);
  let mx = $state(0);
  let my = $state(0);
  let isHovered = $state(false);
  let containerRef = $state<HTMLDivElement | null>(null);

  // Computeds / derived values
  const cleanHandle = $derived(
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]/g, '_')
      .replace(/_+/g, '_')
      .substring(0, 15)
  );

  const productDisplayName = $derived(() => {
    if (!platformUrl) return 'Your Platform';
    try {
      // Allow URL parsing even if protocols are missing
      const rawUrl = platformUrl.trim();
      const urlObj = new URL(rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`);
      const hostnameParts = urlObj.hostname.replace('www.', '').split('.');
      if (hostnameParts.length > 0) {
        return hostnameParts[0].charAt(0).toUpperCase() + hostnameParts[0].slice(1);
      }
      return 'Platform';
    } catch {
      return 'Platform';
    }
  });

  function handleMouseMove(e: MouseEvent) {
    if (!containerRef) return;
    const rect = containerRef.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    
    // Very gentle 3D tilt (max 1.5 degrees for large container)
    const x = (e.clientX - rect.left) / width - 0.5;
    const y = (e.clientY - rect.top) / height - 0.5;
    
    rx = -y * 1.5;
    ry = x * 1.5;
    
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

  function validateEmail(val: string) {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(val);
  }

  function validateUrl(val: string) {
    const regex = /^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([/\w .-]*)*\/?$/;
    return regex.test(val);
  }

  function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    errorMessage = '';

    if (!name.trim()) {
      errorMessage = 'Maker name is required.';
      return;
    }

    if (!email.trim()) {
      errorMessage = 'Email address is required.';
      return;
    }

    if (!validateEmail(email)) {
      errorMessage = 'Please enter a valid email address.';
      return;
    }

    if (!platformUrl.trim()) {
      errorMessage = 'Platform URL is required.';
      return;
    }

    if (!validateUrl(platformUrl)) {
      errorMessage = 'Please enter a valid platform URL (e.g. myapp.com).';
      return;
    }

    isSubmitting = true;
    encryptProgress = 0;
    encryptLogs = ['> INITIALIZING CRYPTO STREAM SECURE TETHER...'];

    // Mock hash metrics
    ticketNo = `MK_${Math.floor(1000 + Math.random() * 9000)}`;
    secureHash = `KEY_${Math.random().toString(36).substring(2, 10).toUpperCase()}`;

    // Terminal tick simulation steps
    const steps = [
      { delay: 350, msg: '> VERIFYING DOMAIN DNS RECORD... [OK]' },
      { delay: 700, msg: '> PACKAGING PROFILE PAYLOAD (JSON-LD)... [OK]' },
      { delay: 1050, msg: '> REGISTERING ID IN DISTRIBUTED LEDGER...' },
      { delay: 1400, msg: '> GENERATING CRYPTOGRAPHIC KEYPAIR SCHEME...' },
      { delay: 1750, msg: '> INJECTING NODE INTO MAKER SPOTLIGHT CAROUSEL...' },
      { delay: 2000, msg: '> MAKER CREDENTIALS DEPLOYED SUCCESSFULLY.' }
    ];

    steps.forEach((s) => {
      setTimeout(() => {
        if (isSubmitting) {
          encryptLogs = [...encryptLogs, s.msg];
        }
      }, s.delay);
    });

    const duration = 2000;
    const tickTime = 50;
    let elapsed = 0;
    const timer = setInterval(() => {
      elapsed += tickTime;
      encryptProgress = Math.min((elapsed / duration) * 100, 100);

      if (elapsed >= duration) {
        clearInterval(timer);
        // Save the maker to store
        registeredMaker = makersStore.addMaker(name, email, platformUrl);
        isSubmitting = false;
        isSubmitted = true;
      }
    }, tickTime);
  }
</script>

<section id="join-registry" class="relative max-w-5xl mx-auto px-6 py-16 transition-all duration-300">
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    bind:this={containerRef}
    onmousemove={handleMouseMove}
    onmouseenter={handleMouseEnter}
    onmouseleave={handleMouseLeave}
    class="group relative w-full rounded-[24px] bg-surface dark:bg-surface-2 border border-border-custom px-6 py-12 md:py-16 shadow-card hover:shadow-card-hover transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] overflow-hidden transform-gpu z-10"
    style="
      transform: perspective(1000px) rotateX({rx}deg) rotateY({ry}deg);
      --mouse-x: {mx}px; --mouse-y: {my}px;
    "
  >
    <!-- Soft blueprint grid background overlay -->
    <div class="absolute inset-0 blueprint-grid opacity-10 group-hover:opacity-20 pointer-events-none transition-opacity duration-500 z-0"></div>

    <!-- Spotlight cursor glow -->
    <div 
      class="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500 z-0
             bg-[radial-gradient(500px_circle_at_var(--mouse-x)_var(--mouse-y),rgba(232,89,60,0.02),transparent)]
             dark:bg-[radial-gradient(500px_circle_at_var(--mouse-x)_var(--mouse-y),rgba(232,89,60,0.05),transparent)]"
    ></div>

    <!-- Corner Rivets (Skeuomorphic) -->
    <div class="absolute top-4 left-4 w-1.5 h-1.5 rounded-full bg-border-custom/30 dark:bg-border-custom/50 border border-text-primary/10 shadow-[inset_0_1px_1px_rgba(0,0,0,0.15)] flex items-center justify-center pointer-events-none z-10">
      <div class="w-[1px] h-full bg-text-secondary/20 rotate-45"></div>
    </div>
    <div class="absolute top-4 right-4 w-1.5 h-1.5 rounded-full bg-border-custom/30 dark:bg-border-custom/50 border border-text-primary/10 shadow-[inset_0_1px_1px_rgba(0,0,0,0.15)] flex items-center justify-center pointer-events-none z-10">
      <div class="w-[1px] h-full bg-text-secondary/20 -rotate-45"></div>
    </div>
    <div class="absolute bottom-4 left-4 w-1.5 h-1.5 rounded-full bg-border-custom/30 dark:bg-border-custom/50 border border-text-primary/10 shadow-[inset_0_1px_1px_rgba(0,0,0,0.15)] flex items-center justify-center pointer-events-none z-10">
      <div class="w-[1px] h-full bg-text-secondary/20 -rotate-45"></div>
    </div>
    <div class="absolute bottom-4 right-4 w-1.5 h-1.5 rounded-full bg-border-custom/30 dark:bg-border-custom/50 border border-text-primary/10 shadow-[inset_0_1px_1px_rgba(0,0,0,0.15)] flex items-center justify-center pointer-events-none z-10">
      <div class="w-[1px] h-full bg-text-secondary/20 rotate-45"></div>
    </div>

    <!-- Digital Panel Labels -->
    <span class="absolute top-4 right-8 font-mono text-[7.5px] font-bold text-brand-from/40 tracking-wider select-none pointer-events-none uppercase">
      SYS: CORE_REGISTRY_v1.0
    </span>
    <span class="absolute top-4 left-8 font-mono text-[7.5px] font-bold text-text-secondary/30 tracking-wider select-none pointer-events-none uppercase">
      SECTOR: MAKER_STREAM
    </span>
    <span class="absolute bottom-4 right-8 font-mono text-[7.5px] font-bold text-text-secondary/30 tracking-wider select-none pointer-events-none uppercase">
      CONN: SECURE_LINK
    </span>
    <span class="absolute bottom-4 left-8 font-mono text-[7.5px] font-bold text-brand-from/40 tracking-wider select-none pointer-events-none uppercase">
      NODE: ADD_ACTIVE
    </span>

    <div class="relative z-10 w-full">
      {#if !isSubmitted && !isSubmitting}
        <!-- Form Header -->
        <div class="text-center max-w-xl mx-auto mb-10">
          <div class="inline-flex items-center justify-center w-12 h-12 rounded-[15px] bg-gradient-to-br from-brand-from/10 to-brand-to/5 dark:from-brand-from/15 dark:to-brand-to/5 border border-brand-from/15 dark:border-brand-from/35 shadow-inner-custom mb-4 text-brand-from text-lg select-none relative group-hover:scale-105 transition-transform duration-300">
            🛠️
            <span class="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-brand-from animate-bulb-pulse"></span>
          </div>
          <h2 class="font-heading text-3xl font-extrabold text-text-primary tracking-tight leading-[1.1]">
            Join the <span class="font-display italic font-semibold text-brand-from">Maker Registry</span>
          </h2>
          <p class="font-body text-xs sm:text-sm text-text-secondary mt-2">
            Secure your maker pass, register your product link, and showcase your creations to the TechTank community.
          </p>
        </div>

        <!-- Main Form & Live Preview Grid -->
        <div class="grid grid-cols-1 md:grid-cols-12 gap-8 items-center max-w-4xl mx-auto">
          
          <!-- Left side: The Console Inputs -->
          <form onsubmit={handleSubmit} class="md:col-span-7 flex flex-col gap-4 text-left" novalidate>
            <!-- Name Input -->
            <div class="flex flex-col gap-1.5 relative">
              <label for="maker-name" class="font-mono text-[9px] font-bold text-text-secondary uppercase tracking-wider pl-1">
                $ MAKER_NAME:
              </label>
              <div class="relative flex items-center">
                <span class="absolute left-4 font-mono text-[9px] text-brand-from/60 pointer-events-none select-none">▶</span>
                <input
                  type="text"
                  id="maker-name"
                  placeholder="e.g. John Doe"
                  bind:value={name}
                  class="w-full pl-8 pr-4 py-3 rounded-[12px] border border-border-custom bg-surface dark:bg-surface-3/30 text-xs font-mono text-text-primary focus:outline-none focus:border-brand-from focus:ring-4 focus:ring-brand-from/5 shadow-[inset_0_1.5px_3px_rgba(0,0,0,0.04)] transition-all duration-200"
                />
              </div>
            </div>

            <!-- Email Input -->
            <div class="flex flex-col gap-1.5 relative">
              <label for="maker-email" class="font-mono text-[9px] font-bold text-text-secondary uppercase tracking-wider pl-1">
                $ CONTACT_EMAIL:
              </label>
              <div class="relative flex items-center">
                <span class="absolute left-4 font-mono text-[9px] text-brand-from/60 pointer-events-none select-none">▶</span>
                <input
                  type="email"
                  id="maker-email"
                  placeholder="e.g. john@example.com"
                  bind:value={email}
                  class="w-full pl-8 pr-4 py-3 rounded-[12px] border border-border-custom bg-surface dark:bg-surface-3/30 text-xs font-mono text-text-primary focus:outline-none focus:border-brand-from focus:ring-4 focus:ring-brand-from/5 shadow-[inset_0_1.5px_3px_rgba(0,0,0,0.04)] transition-all duration-200"
                />
              </div>
            </div>

            <!-- URL Input -->
            <div class="flex flex-col gap-1.5 relative">
              <label for="maker-url" class="font-mono text-[9px] font-bold text-text-secondary uppercase tracking-wider pl-1">
                $ PORTFOLIO_URL / PLATFORM_URL:
              </label>
              <div class="relative flex items-center">
                <span class="absolute left-4 font-mono text-[9px] text-brand-from/60 pointer-events-none select-none">▶</span>
                <input
                  type="text"
                  id="maker-url"
                  placeholder="e.g. github.com/johndoe or myapp.com"
                  bind:value={platformUrl}
                  class="w-full pl-8 pr-4 py-3 rounded-[12px] border border-border-custom bg-surface dark:bg-surface-3/30 text-xs font-mono text-text-primary focus:outline-none focus:border-brand-from focus:ring-4 focus:ring-brand-from/5 shadow-[inset_0_1.5px_3px_rgba(0,0,0,0.04)] transition-all duration-200"
                />
              </div>
            </div>

            <!-- Error Banner -->
            {#if errorMessage}
              <div class="font-mono text-[9.5px] text-brand-from font-bold uppercase tracking-wider bg-brand-from/5 border border-brand-from/15 rounded-lg p-2.5 flex items-center gap-1.5 animate-pulse">
                ⚠️ SYSTEM WARNING // {errorMessage}
              </div>
            {/if}

            <Button
              type="submit"
              variant="primary"
              size="lg"
              class="w-full mt-2 shadow-cta select-none"
            >
              Verify & Register Node
            </Button>
          </form>

          <!-- Right side: Realtime HUD Preview -->
          <div class="md:col-span-5 flex flex-col items-center justify-center">
            <span class="font-mono text-[8px] font-bold text-text-secondary/60 uppercase tracking-widest mb-3 flex items-center gap-1 select-none">
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              Live HUD Preview
            </span>
            
            <!-- Maker Card Mirror Component -->
            <div class="relative flex flex-col justify-between w-60 h-[330px] bg-surface-2 dark:bg-surface-3 border border-border-custom rounded-[20px] p-4.5 shadow-card hover:border-brand-from/30 transition-all duration-300 ease-out select-none overflow-hidden shrink-0">
              <!-- Holographic grid watermark -->
              <div class="absolute inset-0 blueprint-grid opacity-10 pointer-events-none"></div>

              <!-- Top maker label -->
              <div class="flex items-center gap-1 absolute top-3.5 left-3.5 z-10 bg-surface/90 dark:bg-surface-2/90 px-1.5 py-0.5 rounded-full border border-border-custom/80 font-mono text-[7px] font-bold text-text-secondary">
                <span class="w-1 h-1 rounded-full bg-brand-from animate-pulse"></span>
                <span>PREVIEW</span>
              </div>

              <!-- Barcode symbol -->
              <div class="absolute top-3.5 right-3.5 opacity-15 select-none z-10">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path d="M4 6h2v12H4zm4 0h1v12H8zm3 0h3v12h-3zm5 0h1v12h-1zm3 0h1v12h-1z"/>
                </svg>
              </div>

              <div class="relative z-10 flex flex-col justify-between h-full pt-3">
                <!-- Avatar block -->
                <div>
                  <div class="relative w-[60px] h-[60px] mx-auto rounded-xl p-0.5 bg-gradient-to-br from-surface to-surface-2 dark:from-surface-2 dark:to-surface-3 border border-border-custom overflow-hidden flex items-center justify-center mb-2.5 shadow-inner-custom">
                    <!-- TechTank Placeholder Robot/Icon Avatar -->
                    <div class="w-full h-full rounded-[9px] bg-gradient-to-tr from-brand-from/20 to-brand-to/10 flex items-center justify-center text-xl font-bold select-none text-brand-from">
                      {name ? name.charAt(0).toUpperCase() : '👾'}
                    </div>
                  </div>

                  <!-- Details -->
                  <div class="text-center px-1">
                    <h3 class="font-heading text-xs font-extrabold text-text-primary truncate leading-tight">
                      {name.trim() || 'Your Name'}
                    </h3>
                    <p class="font-mono text-[8px] text-text-secondary/70 mt-0.5">
                      @{cleanHandle || 'your_handle'}
                    </p>
                  </div>
                </div>

                <!-- Stats panel -->
                <div class="grid grid-cols-2 gap-1.5 text-left my-1">
                  <div class="bg-surface border border-border-custom/50 rounded-lg p-1 text-center shadow-inner-custom">
                    <span class="block text-[6.5px] font-mono font-bold text-text-secondary/80 uppercase tracking-widest">Launches</span>
                    <span class="block font-mono text-[10px] font-extrabold text-brand-from leading-none mt-0.5">1</span>
                  </div>

                  <div class="bg-surface border border-border-custom/50 rounded-lg p-1 text-center shadow-inner-custom">
                    <span class="block text-[6.5px] font-mono font-bold text-text-secondary/80 uppercase tracking-widest">Top Votes</span>
                    <span class="block font-mono text-[10px] font-extrabold text-brand-from leading-none mt-0.5">+1</span>
                  </div>
                </div>

                <!-- Launch section -->
                <div class="border-t border-border-custom/30 pt-2 w-full text-center mt-auto">
                  <span class="text-[6.5px] font-bold text-text-secondary/60 uppercase tracking-widest block">Signature Launch</span>
                  <span class="text-[9.5px] font-extrabold text-brand-from mt-0.5 truncate block">
                    🚀 {productDisplayName()}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

      {:else if isSubmitting}
        <!-- Simulated Terminal Log Compilation -->
        <div class="py-10 flex flex-col items-center gap-5 max-w-md mx-auto animate-in zoom-in-98 duration-300">
          
          <div class="w-14 h-14 rounded-[18px] bg-surface-2 dark:bg-surface-3 border border-border-custom flex items-center justify-center shadow-inner-custom select-none">
            <svg class="animate-spin h-5 w-5 text-brand-from" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          </div>

          <div class="w-full flex flex-col gap-2">
            <h3 class="font-mono text-[9px] font-black uppercase text-brand-from tracking-widest animate-pulse">
              ⚡ COMPILING MAKER PAYLOAD NETWORK...
            </h3>
            
            <!-- Typewriter diagnostics console -->
            <div class="w-full h-24 bg-surface-2 dark:bg-surface-3 border border-border-custom/50 rounded-lg p-2.5 text-left font-mono text-[7px] text-text-secondary overflow-hidden shadow-inner-custom flex flex-col gap-1 select-none">
              {#each encryptLogs as log}
                <div class="truncate">{log}</div>
              {/each}
            </div>

            <!-- Progress bar -->
            <div class="w-full h-1 bg-surface-2 dark:bg-surface-3 rounded-full overflow-hidden border border-border-custom/30 select-none">
              <div 
                class="h-full bg-gradient-to-r from-brand-from to-brand-to transition-all duration-75"
                style="width: {encryptProgress}%"
              ></div>
            </div>
          </div>
        </div>

      {:else}
        <!-- Stamped VIP Maker Pass success ticket state -->
        <div class="py-4 flex flex-col items-center animate-in zoom-in-95 duration-500">
          
          <div class="relative w-full max-w-sm rounded-[24px] bg-surface-2 dark:bg-surface-3 border border-emerald-500/25 shadow-[0_10px_35px_rgba(16,185,129,0.08),inset_0_1px_0_rgba(255,255,255,0.05)] p-6 text-left overflow-hidden">
            <!-- Blueprint pattern on ticket -->
            <div class="absolute inset-0 blueprint-grid opacity-10 pointer-events-none"></div>

            <!-- Hanging lanyard slot shape -->
            <div class="w-12 h-2 rounded-full bg-text-primary/10 border border-text-primary/5 mx-auto mb-5 shadow-[inset_0_1px_1.5px_rgba(0,0,0,0.15)] pointer-events-none"></div>

            <!-- Security indicator light -->
            <div class="absolute top-5 right-5 flex items-center gap-1 bg-surface dark:bg-surface-2 px-2 py-0.5 border border-emerald-500/20 rounded-md">
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bulb-pulse shadow-[0_0_6px_#10b981]"></span>
              <span class="font-mono text-[6.5px] font-bold text-emerald-500 uppercase tracking-wide">MAKER_OK</span>
            </div>

            <!-- Micro chip stamp -->
            <div class="absolute bottom-5 right-5 w-8 h-8 rounded-[8px] bg-gradient-to-br from-amber-500/10 to-amber-500/5 border border-amber-500/30 flex items-center justify-center opacity-85 select-none pointer-events-none">
              <svg viewBox="0 0 24 24" class="w-5 h-5 text-amber-500/70" fill="none" stroke="currentColor" stroke-width="1.5">
                <rect x="5" y="5" width="14" height="14" rx="2" />
                <path d="M9 5v4M15 5v4M9 15v4M15 15v4M5 9h4M5 15h4M15 9h4M15 15h4" />
              </svg>
            </div>

            <!-- Pass details header -->
            <h3 class="font-heading text-[10px] font-black uppercase text-text-primary tracking-widest border-b border-border-custom pb-2.5 mb-3.5 select-none flex items-center gap-1.5">
              🎟️ MAKER LICENSE AUTHORIZED
            </h3>

            <!-- Registration table data -->
            <div class="flex flex-col gap-2 font-mono text-[8.5px] text-text-secondary select-none">
              <div class="flex justify-between border-b border-border-custom/30 pb-1">
                <span>NAME:</span>
                <span class="text-text-primary font-bold">{registeredMaker?.name}</span>
              </div>
              <div class="flex justify-between border-b border-border-custom/30 pb-1">
                <span>HANDLE:</span>
                <span class="text-text-primary font-bold">@{registeredMaker?.handle}</span>
              </div>
              <div class="flex justify-between border-b border-border-custom/30 pb-1">
                <span>TICKET ID:</span>
                <span class="text-emerald-500 font-bold">{ticketNo}</span>
              </div>
              <div class="flex justify-between border-b border-border-custom/30 pb-1">
                <span>CRYPTO HASH:</span>
                <span class="text-brand-from font-bold">{secureHash}</span>
              </div>
              <div class="flex justify-between border-b border-border-custom/30 pb-1">
                <span>LAUNCH PLATFORM:</span>
                <a 
                  href={platformUrl.startsWith('http') ? platformUrl : `https://${platformUrl}`}
                  target="_blank" 
                  rel="noopener noreferrer" 
                  class="text-brand-from font-bold hover:underline hover:text-brand-to transition-colors"
                >
                  {registeredMaker?.topProduct} ↗
                </a>
              </div>
            </div>

            <!-- Welcome notes -->
            <div class="mt-5 text-[9.5px] text-text-secondary leading-relaxed bg-surface/50 dark:bg-surface-2/50 rounded-lg p-2.5 border border-border-custom/40">
              <span class="font-bold text-text-primary">Registry complete!</span> Node injected successfully. Your Maker Card is now active and has been promoted to the front of the <span class="font-bold text-brand-from">Maker Spotlight</span> showcase above.
            </div>
          </div>
          
          <!-- Back button -->
          <button
            onclick={() => { isSubmitted = false; name = ''; email = ''; platformUrl = ''; }}
            class="mt-6 font-mono text-[8px] font-bold text-brand-from tracking-wider uppercase hover:underline cursor-pointer"
          >
            ← Register Another Node
          </button>
        </div>
      {/if}
    </div>
  </div>
</section>
