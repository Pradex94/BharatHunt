<script lang="ts">
  import Button from '../ui/Button.svelte';

  let email = $state('');
  let isSubmitting = $state(false);
  let isSubmitted = $state(false);
  let errorMessage = $state('');

  // Encryption logs simulation state
  let encryptProgress = $state(0);
  let encryptLogs = $state<string[]>([]);
  let ticketNo = $state('');
  let secureHash = $state('');

  // Card perspective tilts & spotlight cursors
  let rx = $state(0);
  let ry = $state(0);
  let mx = $state(0);
  let my = $state(0);
  let isHovered = $state(false);
  let containerRef = $state<HTMLDivElement | null>(null);

  function handleMouseMove(e: MouseEvent) {
    if (!containerRef) return;
    const rect = containerRef.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    
    // Smooth 3D tilt (max 2 degrees for visual ease on larger blocks)
    const x = (e.clientX - rect.left) / width - 0.5;
    const y = (e.clientY - rect.top) / height - 0.5;
    
    rx = -y * 2;
    ry = x * 2;
    
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

  function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    errorMessage = '';

    if (!email) {
      errorMessage = 'Please enter an email address.';
      return;
    }

    if (!validateEmail(email)) {
      errorMessage = 'Please enter a valid email address.';
      return;
    }

    isSubmitting = true;
    encryptProgress = 0;
    encryptLogs = ['> INITIALIZING WAITLIST SECURE HANDSHAKE...'];

    // Generate mock ticket metadata
    ticketNo = `TK_${Math.floor(1000 + Math.random() * 9000)}`;
    secureHash = `SEC_${Math.random().toString(36).substring(2, 10).toUpperCase()}`;

    // Ticker simulation intervals
    const steps = [
      { delay: 300, msg: '> GENERATING RSA_KEYPAR SCHEME... [OK]' },
      { delay: 600, msg: '> ENCRYPTING CREDENTIAL PINS [AES_256]...' },
      { delay: 900, msg: '> TUNNELLING CORE ENCRYPTED METADATA...' },
      { delay: 1200, msg: '> RESPONSE GRANTED FROM GATEWAY [OK]' },
      { delay: 1500, msg: '> VIP SIGNATURE STAMPED SECURELY.' }
    ];

    steps.forEach((s) => {
      setTimeout(() => {
        if (isSubmitting) {
          encryptLogs = [...encryptLogs, s.msg];
        }
      }, s.delay);
    });

    const duration = 1500;
    const tickTime = 50;
    let elapsed = 0;
    const timer = setInterval(() => {
      elapsed += tickTime;
      encryptProgress = Math.min((elapsed / duration) * 100, 100);

      if (elapsed >= duration) {
        clearInterval(timer);
        isSubmitting = false;
        isSubmitted = true;
      }
    }, tickTime);
  }
</script>

<section id="about" class="relative max-w-4xl mx-auto px-6 py-20 transition-all duration-300">
  
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    bind:this={containerRef}
    onmousemove={handleMouseMove}
    onmouseenter={handleMouseEnter}
    onmouseleave={handleMouseLeave}
    class="group relative w-full rounded-[24px] bg-surface dark:bg-surface-2 border border-border-custom px-8 py-14 md:py-16 text-center shadow-card hover:shadow-card-hover transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] overflow-hidden transform-gpu z-10"
    style="
      transform: perspective(1000px) rotateX({rx}deg) rotateY({ry}deg);
      --mouse-x: {mx}px; --mouse-y: {my}px;
    "
  >
    <!-- Soft blueprint graph grid background overlay on hover -->
    <div class="absolute inset-0 blueprint-grid opacity-10 group-hover:opacity-20 pointer-events-none transition-opacity duration-500 z-0"></div>

    <!-- Extremely Soft Spotlight Cursor Glow -->
    <div 
      class="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500 z-0
             bg-[radial-gradient(420px_circle_at_var(--mouse-x)_var(--mouse-y),rgba(232,89,60,0.025),transparent)]
             dark:bg-[radial-gradient(420px_circle_at_var(--mouse-x)_var(--mouse-y),rgba(232,89,60,0.065),transparent)]"
    ></div>

    <!-- Skeuomorphic Corner Rivets -->
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

    <!-- Monospace instrumentation borders -->
    <span class="absolute top-4 right-8 font-mono text-[7.5px] font-bold text-brand-from/40 tracking-wider select-none pointer-events-none">
      SYS: WAITLIST_v2.0
    </span>
    <span class="absolute top-4 left-8 font-mono text-[7.5px] font-bold text-text-secondary/30 tracking-wider select-none pointer-events-none">
      SECTOR: SEC_ACCESS
    </span>
    <span class="absolute bottom-4 right-8 font-mono text-[7.5px] font-bold text-text-secondary/30 tracking-wider select-none pointer-events-none">
      STAMP: APPROVED
    </span>
    <span class="absolute bottom-4 left-8 font-mono text-[7.5px] font-bold text-brand-from/40 tracking-wider select-none pointer-events-none">
      SYNC: FEED_ACTIVE
    </span>

    <div class="max-w-xl mx-auto relative z-10">
      
      {#if !isSubmitted && !isSubmitting}
        <!-- Icon Telemetry Squircle Badge -->
        <div class="inline-flex items-center justify-center w-12 h-12 rounded-[15px] bg-gradient-to-br from-brand-from/10 to-brand-to/5 dark:from-brand-from/15 dark:to-brand-to/5 border border-brand-from/15 dark:border-brand-from/35 shadow-inner-custom mb-6 text-brand-from text-lg select-none relative group-hover:scale-105 transition-transform duration-300">
          ✉️
          <span class="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-brand-from animate-bulb-pulse"></span>
        </div>

        <h2 class="font-heading text-3xl sm:text-4xl font-extrabold text-text-primary tracking-tight leading-[1.1]">
          Be the first to <span class="font-display italic font-semibold text-brand-from">discover</span> craft code
        </h2>
        <p class="font-body text-xs sm:text-sm text-text-secondary mt-3.5 mb-9 leading-relaxed max-w-md mx-auto">
          New products drop every single day. Join the waitlist to receive our curated weekly hardware-grade software digests.
        </p>

        <!-- Waitlist Input Cockpit Form -->
        <form
          onsubmit={handleSubmit}
          class="flex flex-col sm:flex-row gap-3 w-full justify-center items-stretch max-w-lg mx-auto"
          id="newsletter"
          novalidate
        >
          <div class="flex-grow relative flex items-center">
            <label for="waitlist-email" class="sr-only">Email address</label>
            
            <!-- Typewriter Command prompt prefix -->
            <span class="absolute left-4.5 font-mono text-[8px] font-extrabold text-brand-from select-none pointer-events-none uppercase">
              $ USR_EMAIL:
            </span>

            <input
              type="email"
              id="waitlist-email"
              placeholder=" "
              bind:value={email}
              class="w-full pl-22 pr-5 py-3.5 rounded-[12px] border border-border-custom bg-surface dark:bg-surface-3/30 text-xs font-mono text-text-primary focus:outline-none focus:border-brand-from focus:ring-4 focus:ring-brand-from/5 shadow-[inset_0_1.5px_3px_rgba(0,0,0,0.04)] transition-all duration-200"
            />
            
            <!-- Blinking digital cursor inside input -->
            {#if !email}
              <span class="absolute left-[92px] font-mono text-xs text-brand-from animate-pulse pointer-events-none">_</span>
            {/if}
          </div>

          <Button
            type="submit"
            variant="primary"
            size="md"
            class="min-w-[140px] shadow-sm select-none"
          >
            Register Pass
          </Button>
        </form>

        {#if errorMessage}
          <p class="font-mono text-[9px] text-brand-from text-left sm:text-center mt-3.5 font-bold uppercase tracking-wider animate-pulse flex items-center justify-center gap-1">
            ⚠️ WARNING // {errorMessage}
          </p>
        {/if}

      {:else if isSubmitting}
        <!-- Simulated Secure Encryption Pipeline -->
        <div class="py-6 flex flex-col items-center gap-4 max-w-md mx-auto animate-in zoom-in-98 duration-300">
          
          <!-- Large Loading telemetry squircle -->
          <div class="w-14 h-14 rounded-[18px] bg-surface-2 dark:bg-surface-3 border border-border-custom flex items-center justify-center shadow-inner-custom select-none">
            <svg class="animate-spin h-5 w-5 text-brand-from" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          </div>

          <div class="w-full flex flex-col gap-1.5">
            <h3 class="font-mono text-[10px] font-black uppercase text-brand-from tracking-widest animate-pulse">
              ⚡ TUNNELLING CRYPTO SIGNATURE...
            </h3>
            
            <!-- Typewriter output monitor console -->
            <div class="w-full h-24 bg-surface-2 dark:bg-surface-3 border border-border-custom/50 rounded-lg p-2.5 text-left font-mono text-[7px] text-text-secondary overflow-hidden shadow-inner-custom flex flex-col gap-1 select-none">
              {#each encryptLogs as log}
                <div class="truncate">{log}</div>
              {/each}
            </div>

            <!-- Solid progress bar -->
            <div class="w-full h-1 bg-surface-2 dark:bg-surface-3 rounded-full overflow-hidden border border-border-custom/30 select-none">
              <div 
                class="h-full bg-gradient-to-r from-brand-from to-brand-to transition-all duration-75"
                style="width: {encryptProgress}%"
              ></div>
            </div>
          </div>
        </div>

      {:else}
        <!-- Stamped VIP access ticket success state -->
        <div class="py-2 flex flex-col items-center animate-in zoom-in-95 duration-500">
          
          <!-- Physical access ticket structure -->
          <div class="relative w-full max-w-sm rounded-[20px] bg-surface-2 dark:bg-surface-3 border border-emerald-500/25 shadow-[0_8px_32px_rgba(16,185,129,0.06),inset_0_1px_0_rgba(255,255,255,0.05)] p-6 text-left overflow-hidden">
            
            <!-- Blueprint graph texture on ticket -->
            <div class="absolute inset-0 blueprint-grid opacity-10 pointer-events-none"></div>

            <!-- Hanging lanyard slot shape -->
            <div class="w-12 h-2 rounded-full bg-text-primary/10 border border-text-primary/5 mx-auto mb-5 shadow-[inset_0_1px_1.5px_rgba(0,0,0,0.15)] pointer-events-none"></div>

            <!-- Security indicator light -->
            <div class="absolute top-5 right-5 flex items-center gap-1 bg-surface dark:bg-surface-2 px-2 py-0.5 border border-emerald-500/20 rounded-md">
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bulb-pulse shadow-[0_0_6px_#10b981]"></span>
              <span class="font-mono text-[6.5px] font-bold text-emerald-500 uppercase tracking-wide">SECURE_PASS</span>
            </div>

            <!-- Micro chip stamp -->
            <div class="absolute bottom-5 right-5 w-8 h-8 rounded-[8px] bg-gradient-to-br from-amber-500/10 to-amber-500/5 border border-amber-500/30 flex items-center justify-center opacity-85 select-none pointer-events-none">
              <!-- Microchip circuitry tracks -->
              <svg viewBox="0 0 24 24" class="w-5 h-5 text-amber-500/70" fill="none" stroke="currentColor" stroke-width="1.5">
                <rect x="5" y="5" width="14" height="14" rx="2" />
                <path d="M9 5v4M15 5v4M9 15v4M15 15v4M5 9h4M5 15h4M15 9h4M15 15h4" />
              </svg>
            </div>

            <!-- Pass details -->
            <h3 class="font-heading text-xs font-black uppercase text-text-primary tracking-widest border-b border-border-custom pb-2.5 mb-3.5 select-none flex items-center gap-1.5">
              🎟️ ALPHA ACCESS AUTHORIZATION
            </h3>

            <!-- Monospace Ticket details table -->
            <div class="flex flex-col gap-2 font-mono text-[8.5px] text-text-secondary select-none">
              <div class="flex justify-between border-b border-border-custom/30 pb-1">
                <span>HOLDER:</span>
                <span class="text-text-primary font-bold">ALPHA_BUILDER</span>
              </div>
              <div class="flex justify-between border-b border-border-custom/30 pb-1">
                <span>TICKET_NO:</span>
                <span class="text-emerald-500 font-bold">{ticketNo}</span>
              </div>
              <div class="flex justify-between border-b border-border-custom/30 pb-1">
                <span>SEC_HASH:</span>
                <span class="text-brand-from font-bold">{secureHash}</span>
              </div>
              <div class="flex justify-between border-b border-border-custom/30 pb-1">
                <span>STATUS:</span>
                <span class="text-emerald-500 font-bold uppercase tracking-wider animate-pulse">VIP_AUTHORIZED</span>
              </div>
            </div>

            <!-- Welcome notes -->
            <div class="mt-5 text-[10px] text-text-secondary leading-relaxed bg-surface/50 dark:bg-surface-2/50 rounded-lg p-2.5 border border-border-custom/40">
              <span class="font-bold text-text-primary">Welcome to the Tank!</span> You have successfully secured an alpha entry slot. Curated products will stream to your inbox weekly.
            </div>

          </div>
          
          <!-- Back button -->
          <button
            onclick={() => { isSubmitted = false; email = ''; }}
            class="mt-6 font-mono text-[8px] font-bold text-brand-from tracking-wider uppercase hover:underline cursor-pointer"
          >
            ← Register Another Email
          </button>
        </div>
      {/if}

      <!-- Trust Badging -->
      {#if !isSubmitted}
        <p class="font-body text-xs text-text-secondary/70 mt-5 pointer-events-none select-none">
          No spam. Unsubscribe anytime. <span class="font-bold text-text-primary">4,200+</span> builders already in.
        </p>
      {/if}
    </div>
  </div>
</section>
