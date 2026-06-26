<script lang="ts">
  const steps = [
    {
      number: '01',
      title: 'Launch Console',
      tagline: 'Initialize deployment',
      description: 'Fill out our simplified submission form, compile assets, and stream your project live to the global edge network.',
      icon: '🚀'
    },
    {
      number: '02',
      title: 'Get Discovered',
      tagline: 'Climb community ranking',
      description: 'Tech fans and fellow builders browse the daily feed, upvote what inspires them, and discuss hardware craft.',
      icon: '🔥'
    },
    {
      number: '03',
      title: 'Growth Synthesizer',
      tagline: 'Velocity scale analytics',
      description: 'Acquire early adopters, collect high-fidelity feedback, and tune your viral growth trajectory.',
      icon: '⭐'
    }
  ];

  // Svelte 5 states for Card tilts and cursor tracking
  let tilts = $state([
    { rx: 0, ry: 0, mx: 0, my: 0, isHovered: false },
    { rx: 0, ry: 0, mx: 0, my: 0, isHovered: false },
    { rx: 0, ry: 0, mx: 0, my: 0, isHovered: false }
  ]);

  let cardRefs = $state<(HTMLDivElement | null)[]>([null, null, null]);

  function handleMouseMove(e: MouseEvent, index: number) {
    const card = cardRefs[index];
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    
    // Very gentle 3D tilt (max 3 degrees)
    const x = (e.clientX - rect.left) / width - 0.5;
    const y = (e.clientY - rect.top) / height - 0.5;
    
    tilts[index].rx = -y * 3;
    tilts[index].ry = x * 3;
    
    tilts[index].mx = e.clientX - rect.left;
    tilts[index].my = e.clientY - rect.top;
  }

  function handleMouseEnter(index: number) {
    tilts[index].isHovered = true;
  }

  function handleMouseLeave(index: number) {
    tilts[index].isHovered = false;
    tilts[index].rx = 0;
    tilts[index].ry = 0;
  }

  // --- Step 1: Console Launch clicker & Countdown State Machine ---
  let launchStatus = $state<'idle' | 'igniting' | 'live'>('idle');
  let countdown = $state(3);
  let launchProgress = $state(0);
  let terminalLogs = $state<string[]>([]);
  let launchTimer: ReturnType<typeof setInterval> | null = null;

  function triggerLaunch() {
    launchStatus = 'igniting';
    countdown = 3;
    launchProgress = 0;
    terminalLogs = ['> INITIALIZING IGNITION PROTOCOL...'];

    // Stream logs in sequence
    const logIntervals = [
      { delay: 300, msg: '> SECURING TUNNEL SSH-A [OK]' },
      { delay: 600, msg: '> SYNCING MEMORY BUFFERS...' },
      { delay: 900, msg: '> REGISTERING DNS RECORD [OK]' },
      { delay: 1200, msg: '> DEPLOYING COLD IN 12MS...' },
      { delay: 1500, msg: '> STREAMING ASSETS COMPLETED' },
      { delay: 1800, msg: '> PIPELINE: LIVE ON EDGE NODE' }
    ];

    logIntervals.forEach((item) => {
      setTimeout(() => {
        if (launchStatus === 'igniting') {
          terminalLogs = [...terminalLogs, item.msg];
        }
      }, item.delay);
    });

    // Countdown and Progress ticking
    const totalDuration = 1800; // 1.8 seconds
    const intervalTime = 50;
    let elapsed = 0;

    launchTimer = setInterval(() => {
      elapsed += intervalTime;
      launchProgress = Math.min((elapsed / totalDuration) * 100, 100);

      // Countdown updater
      if (elapsed < 600) {
        countdown = 3;
      } else if (elapsed < 1200) {
        countdown = 2;
      } else if (elapsed < 1800) {
        countdown = 1;
      } else {
        countdown = 0;
      }

      if (elapsed >= totalDuration) {
        launchStatus = 'live';
        if (launchTimer) clearInterval(launchTimer);
      }
    }, intervalTime);
  }

  function resetLaunch() {
    launchStatus = 'idle';
    countdown = 3;
    launchProgress = 0;
    terminalLogs = [];
    if (launchTimer) clearInterval(launchTimer);
  }

  // --- Step 2: Discovery upvote clicker & Ranking Feed Simulator ---
  let hasVoted = $state(false);
  let voteCount = $state(42);
  let feedProducts = $state([
    { id: 'zenith', name: 'Zenith Editor', votes: 78, isUser: false },
    { id: 'pulse', name: 'PulseFlow', votes: 56, isUser: false },
    { id: 'user', name: 'Your Product', votes: 42, isUser: true }
  ]);

  // Reactive sorting of rankings
  let sortedFeed = $derived([...feedProducts].sort((a, b) => b.votes - a.votes));

  // Upvote celebration particle burst state
  let particles = $state<{ id: number; emoji: string; left: number; drift: number; spin: number; duration: number; scale: number }[]>([]);
  let nextParticleId = 0;

  function spawnParticles() {
    const emojis = ['❤️', '✨', '🔥', '🚀', '🙌', '🎉', '👍'];
    for (let i = 0; i < 6; i++) {
      particles = [
        ...particles,
        {
          id: nextParticleId++,
          emoji: emojis[Math.floor(Math.random() * emojis.length)],
          left: 25 + Math.random() * 50,
          drift: (Math.random() - 0.5) * 50,
          spin: (Math.random() - 0.5) * 360,
          duration: 0.6 + Math.random() * 0.4,
          scale: 0.8 + Math.random() * 0.4
        }
      ];
    }
  }

  function removeParticle(id: number) {
    particles = particles.filter((p) => p.id !== id);
  }

  function handleStepVote() {
    hasVoted = !hasVoted;
    
    // Find user product in array to trigger reactiveness
    const userProd = feedProducts.find(p => p.isUser);
    if (!userProd) return;

    if (hasVoted) {
      voteCount = 57;
      userProd.votes = 57;
      spawnParticles();
    } else {
      voteCount = 42;
      userProd.votes = 42;
    }
  }

  // --- Step 3: Grow analytics interactive Waveform Synthesizer ---
  let activeSource = $state<'direct' | 'community' | 'viral'>('direct');
  let growVelocity = $state<1.0 | 2.5 | 5.0>(1.0);
  let trafficRate = $state(0);

  // Morphable SVG line paths for 100x40 viewBox
  const paths = {
    direct: 'M 5,35 C 30,32 60,30 95,25',
    community: 'M 5,35 C 30,35 50,12 70,30 C 80,38 90,20 95,8',
    viral: 'M 5,35 C 30,35 45,28 60,18 C 75,8 85,2 95,1'
  };

  let targetRate = $derived.by(() => {
    let base = 1250;
    if (activeSource === 'community') base = 4800;
    else if (activeSource === 'viral') base = 12400;
    return Math.round(base * growVelocity);
  });

  // Cycle Rotary Grow Velocity dial knob
  function cycleVelocity() {
    if (growVelocity === 1.0) growVelocity = 2.5;
    else if (growVelocity === 2.5) growVelocity = 5.0;
    else growVelocity = 1.0;
  }

  // Smooth speedometer ticking effect on target shift
  let tickerInterval: ReturnType<typeof setInterval>;
  $effect(() => {
    const target = targetRate;
    clearInterval(tickerInterval);

    const stepsCount = 12;
    const stepTime = 35;
    let currentStep = 0;
    const startRate = trafficRate;

    tickerInterval = setInterval(() => {
      currentStep++;
      const t = currentStep / stepsCount;
      const ease = t * (2 - t); // quadratic ease-out
      trafficRate = Math.round(startRate + (target - startRate) * ease);

      if (currentStep >= stepsCount) {
        trafficRate = target;
        clearInterval(tickerInterval);
      }
    }, stepTime);

    return () => clearInterval(tickerInterval);
  });
</script>

<section id="categories" class="relative max-w-7xl mx-auto px-6 py-24 overflow-hidden transition-all duration-300">
  <!-- Soft blueprint graph grid background -->
  <div class="absolute inset-0 blueprint-grid opacity-20 dark:opacity-40 pointer-events-none z-0"></div>

  <!-- Vibrant floating soft gradient blobs for roadmap context -->
  <div class="absolute inset-0 pointer-events-none z-0 overflow-hidden">
    <div class="absolute -top-[10%] left-[10%] w-[300px] h-[300px] rounded-full bg-brand-from/5 blur-[80px] animate-glow-slow-1"></div>
    <div class="absolute top-[40%] left-[45%] w-[250px] h-[250px] rounded-full bg-brand-to/5 blur-[90px] animate-glow-slow-2"></div>
    <div class="absolute bottom-[5%] right-[10%] w-[320px] h-[320px] rounded-full bg-emerald-500/5 blur-[100px] animate-glow-slow-3"></div>
  </div>

  <div class="relative z-10">
    <!-- Header -->
    <div class="reveal-item text-center max-w-xl mx-auto mb-20 relative z-10">
      <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-from/5 border border-brand-from/15 font-mono text-[9px] font-extrabold tracking-widest text-brand-from uppercase shadow-[0_1px_2px_rgba(0,0,0,0.01)] mb-3 select-none">
        📋 Launch Roadmap Pipeline
      </span>
      <h2 class="font-heading text-3xl sm:text-4xl font-extrabold text-text-primary tracking-tight">
        Built by makers, for makers
      </h2>
      <p class="font-body text-xs sm:text-sm text-text-secondary mt-3 leading-relaxed">
        We stripped away the clutter to build a streamlined, discovery-focused command center. Here is how your launch progresses.
      </p>
    </div>

    <!-- Steps Grid -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-10 lg:gap-8 relative z-10">
      
      <!-- Elegant double-rail circuit connector lines behind cards on Desktop -->
      <div class="hidden lg:block absolute top-[22%] left-[12%] right-[12%] h-12 pointer-events-none z-0">
        <svg class="w-full h-full text-brand-from/15 dark:text-brand-from/20" fill="none" viewBox="0 0 1000 60" preserveAspectRatio="none">
          <!-- Top circuit path -->
          <path d="M 30,20 L 970,20" class="stroke-current stroke-[1.5] stroke-dasharray-[8,6]" />
          <!-- Bottom circuit path -->
          <path d="M 30,40 L 970,40" class="stroke-current stroke-[1.2]" />
          
          <!-- Micro solder pads -->
          <circle cx="30" cy="20" r="3" class="fill-surface dark:fill-surface-2 stroke-brand-from/35 stroke-1" />
          <circle cx="30" cy="40" r="3" class="fill-surface dark:fill-surface-2 stroke-brand-from/35 stroke-1" />
          <circle cx="500" cy="20" r="3.5" class="fill-surface dark:fill-surface-2 stroke-brand-from/40 stroke-1" />
          <circle cx="500" cy="40" r="3.5" class="fill-surface dark:fill-surface-2 stroke-brand-from/40 stroke-1" />
          <circle cx="970" cy="20" r="3" class="fill-surface dark:fill-surface-2 stroke-brand-from/35 stroke-1" />
          <circle cx="970" cy="40" r="3" class="fill-surface dark:fill-surface-2 stroke-brand-from/35 stroke-1" />

          <!-- Gliding electrical signal signals -->
          <circle r="4.5" fill="var(--brand-from)" class="shadow-[0_0_6px_rgba(232,89,60,0.6)]">
            <animateMotion dur="5.5s" repeatCount="indefinite" path="M 30,20 L 970,20" />
          </circle>
          <circle r="4" fill="var(--brand-to)" class="shadow-[0_0_6px_rgba(242,166,35,0.6)]">
            <animateMotion dur="8s" repeatCount="indefinite" path="M 970,40 L 30,40" />
          </circle>
        </svg>
      </div>

      {#each steps as step, index}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          bind:this={cardRefs[index]}
          onmousemove={(e) => handleMouseMove(e, index)}
          onmouseenter={() => handleMouseEnter(index)}
          onmouseleave={() => handleMouseLeave(index)}
          class="group reveal-item relative flex flex-col justify-between items-center text-center p-6 bg-surface dark:bg-surface-2 border border-border-custom/50 dark:border-border-custom/40 rounded-[24px] shadow-card hover:shadow-card-hover hover:border-brand-from/35 transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-[2px] z-10 overflow-hidden transform-gpu h-[460px]"
          style="
            transform: perspective(1000px) rotateX({tilts[index].rx}deg) rotateY({tilts[index].ry}deg);
            --mouse-x: {tilts[index].mx}px; --mouse-y: {tilts[index].my}px;
          "
        >
          <!-- Extremely Soft Spotlight Cursor Glow -->
          <div 
            class="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500 z-0
                   bg-[radial-gradient(280px_circle_at_var(--mouse-x)_var(--mouse-y),rgba(232,89,60,0.015),transparent)]
                   dark:bg-[radial-gradient(280px_circle_at_var(--mouse-x)_var(--mouse-y),rgba(232,89,60,0.05),transparent)]"
          ></div>

          <!-- Skeuomorphic Corner Rivets -->
          <div class="absolute top-3.5 left-3.5 w-1.5 h-1.5 rounded-full bg-border-custom/30 dark:bg-border-custom/50 border border-text-primary/10 shadow-[inset_0_1px_1px_rgba(0,0,0,0.15)] flex items-center justify-center pointer-events-none">
            <div class="w-[1px] h-full bg-text-secondary/20 rotate-45"></div>
          </div>
          <div class="absolute top-3.5 right-3.5 w-1.5 h-1.5 rounded-full bg-border-custom/30 dark:bg-border-custom/50 border border-text-primary/10 shadow-[inset_0_1px_1px_rgba(0,0,0,0.15)] flex items-center justify-center pointer-events-none">
            <div class="w-[1px] h-full bg-text-secondary/20 -rotate-45"></div>
          </div>
          <div class="absolute bottom-3.5 left-3.5 w-1.5 h-1.5 rounded-full bg-border-custom/30 dark:bg-border-custom/50 border border-text-primary/10 shadow-[inset_0_1px_1px_rgba(0,0,0,0.15)] flex items-center justify-center pointer-events-none">
            <div class="w-[1px] h-full bg-text-secondary/20 -rotate-45"></div>
          </div>
          <div class="absolute bottom-3.5 right-3.5 w-1.5 h-1.5 rounded-full bg-border-custom/30 dark:bg-border-custom/50 border border-text-primary/10 shadow-[inset_0_1px_1px_rgba(0,0,0,0.15)] flex items-center justify-center pointer-events-none">
            <div class="w-[1px] h-full bg-text-secondary/20 rotate-45"></div>
          </div>

          <!-- Step Counter Technical Specification Badge -->
          <span class="absolute top-4 right-6 font-mono text-[8px] font-bold text-brand-from/40 tracking-widest uppercase pointer-events-none">
            STP // 0x{step.number}
          </span>
          <span class="absolute bottom-4 right-6 font-mono text-[7px] font-bold text-text-secondary/30 tracking-wider uppercase pointer-events-none select-none">
            [VOLT: 5.0v // SYS: OK]
          </span>
          <span class="absolute bottom-4 left-6 font-mono text-[7px] font-bold text-text-secondary/30 tracking-wider uppercase pointer-events-none select-none">
            [SCT: NODE_{step.number}]
          </span>

          <div class="flex flex-col items-center w-full relative z-10 pt-2">
            <!-- Step Icon Box -->
            <div class="w-13 h-13 rounded-[15px] bg-gradient-to-br from-brand-from/10 to-brand-to/5 dark:from-brand-from/15 dark:to-brand-to/5 border border-brand-from/10 dark:border-brand-from/20 flex items-center justify-center text-xl shadow-inner-custom mb-3 group-hover:scale-105 transition-transform duration-300">
              {step.icon}
            </div>

            <!-- Titles -->
            <h3 class="font-heading text-sm sm:text-base font-extrabold text-text-primary tracking-tight">
              {step.title}
            </h3>
            <p class="font-mono text-[8px] sm:text-[9px] font-bold uppercase tracking-wider text-brand-from mt-0.5">
              {step.tagline}
            </p>

            <!-- Description -->
            <p class="font-body text-[11px] sm:text-xs text-text-secondary leading-relaxed mt-2.5 max-w-[210px]">
              {step.description}
            </p>
          </div>

          <!-- Upvote Particle Burster System (Specific to Card 2) -->
          {#if index === 1}
            {#each particles as p (p.id)}
              <span
                class="absolute pointer-events-none text-sm z-30 select-none"
                style="
                  left: {p.left}%;
                  bottom: 120px;
                  animation: celebration-float-up {p.duration}s cubic-bezier(0.25, 1, 0.5, 1) forwards;
                  --x-drift: {p.drift}px;
                  --spin-deg: {p.spin}deg;
                  transform: scale({p.scale});
                "
                onanimationend={() => removeParticle(p.id)}
              >
                {p.emoji}
              </span>
            {/each}
          {/if}

          <!-- Interactive flat-skeuomorphic control cockpit at bottom -->
          <div class="w-full mt-4 pb-4 flex flex-col items-center justify-center min-h-[160px] relative z-10">
            
            {#if index === 0}
              <!-- Step 1: Launch Command Sequencer -->
              <div class="w-full flex flex-col items-center gap-3">
                
                <!-- Tiny retro screen showing live output -->
                <div class="w-[90%] h-20 bg-surface-2 dark:bg-surface-3 border border-border-custom/50 rounded-lg p-2 flex flex-col justify-start text-left font-mono text-[7px] text-text-secondary overflow-hidden shadow-inner-custom select-none">
                  {#if launchStatus === 'idle'}
                    <div class="text-brand-from/60 uppercase font-black tracking-wide animate-pulse">
                      ⚡ PIPELINE_STANDBY_
                    </div>
                    <div class="mt-1 leading-normal opacity-60">Ready to initialize launch sequence parameters...</div>
                  {:else if launchStatus === 'igniting'}
                    <div class="text-amber-500 font-bold tracking-wide">
                      🔥 IGNITION T-{countdown}S_
                    </div>
                    <div class="flex flex-col gap-0.5 mt-1">
                      {#each terminalLogs.slice(-3) as log}
                        <div class="truncate">{log}</div>
                      {/each}
                    </div>
                  {:else}
                    <div class="text-emerald-500 font-bold tracking-wide animate-pulse">
                      🚀 DEPLOY_COMPLETE_
                    </div>
                    <div class="flex flex-col gap-0.5 mt-1 text-emerald-600/90 dark:text-emerald-400/90">
                      {#each terminalLogs.slice(-3) as log}
                        <div class="truncate">{log}</div>
                      {/each}
                    </div>
                  {/if}
                </div>

                <!-- Ignition controls -->
                <div class="w-full flex items-center justify-between px-4 gap-2">
                  <!-- LED Light Plate -->
                  <div class="flex items-center gap-1.5 bg-surface-2 dark:bg-surface-3 px-2 py-1 border border-border-custom/60 rounded-md">
                    <span class="w-2 h-2 rounded-full transition-all duration-300
                                 {launchStatus === 'idle' ? 'bg-brand-from/40' : ''}
                                 {launchStatus === 'igniting' ? 'bg-amber-400 animate-bulb-pulse shadow-[0_0_6px_#f59e0b]' : ''}
                                 {launchStatus === 'live' ? 'bg-emerald-500 animate-bulb-pulse shadow-[0_0_8px_#10b981]' : ''}"></span>
                    <span class="font-mono text-[7px] font-bold uppercase text-text-secondary select-none">
                      {#if launchStatus === 'idle'}SYS_RDY{:else if launchStatus === 'igniting'}SYS_IGN{:else}SYS_LVE{/if}
                    </span>
                  </div>

                  <!-- Launch / Reset Trigger Button -->
                  {#if launchStatus !== 'live'}
                    <button
                      onclick={triggerLaunch}
                      disabled={launchStatus === 'igniting'}
                      class="relative px-3.5 py-1.5 rounded-lg border border-border-custom font-mono text-[8px] font-extrabold tracking-wider uppercase shadow-sm cursor-pointer transition-all duration-200 active:scale-95 flex items-center gap-1.5
                             {launchStatus === 'igniting'
                               ? 'bg-amber-500/10 text-amber-500 border-amber-500/35 cursor-not-allowed'
                               : 'bg-surface-3 dark:bg-surface-3/15 text-text-primary hover:bg-brand-from/5 hover:border-brand-from/35'}"
                    >
                      {launchStatus === 'igniting' ? 'COMPILING...' : 'LAUNCH ENGINE'}
                    </button>
                  {:else}
                    <button
                      onclick={resetLaunch}
                      class="relative px-3.5 py-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-mono text-[8px] font-extrabold tracking-wider uppercase shadow-sm cursor-pointer transition-all duration-200 active:scale-95 hover:bg-emerald-500/20"
                    >
                      RESET MODULE
                    </button>
                  {/if}
                </div>

                <!-- Ignition Progress Bar -->
                <div class="w-[90%] h-1 bg-surface-2 dark:bg-surface-3 rounded-full overflow-hidden border border-border-custom/30 select-none">
                  <div 
                    class="h-full bg-gradient-to-r from-brand-from to-brand-to transition-all duration-75"
                    style="width: {launchProgress}%"
                  ></div>
                </div>

              </div>

            {:else if index === 1}
              <!-- Step 2: Live Feed Upvote Elevator -->
              <div class="w-full flex flex-col items-center gap-3">
                
                <!-- Micro ranking feed list -->
                <div class="w-[90%] bg-surface-2 dark:bg-surface-3 border border-border-custom/50 rounded-lg p-2 flex flex-col gap-1.5 shadow-inner-custom select-none">
                  {#each sortedFeed as item (item.id)}
                    <div 
                      class="flex items-center justify-between px-2.5 py-1 rounded-md text-[8.5px] border transition-all duration-500 ease-out
                             {item.isUser
                               ? 'bg-brand-from/10 border-brand-from/30 text-brand-from font-bold scale-[1.02] shadow-sm'
                               : 'bg-surface/50 dark:bg-surface-2/50 border-border-custom/20 text-text-secondary'}"
                    >
                      <div class="flex items-center gap-1.5">
                        <span class="font-mono text-[8px] opacity-60">
                          #{sortedFeed.indexOf(item) + 1 === 1 ? '🥇' : sortedFeed.indexOf(item) + 1 === 2 ? '🥈' : '🥉'}
                        </span>
                        <span class="font-body text-[8.5px]">{item.name}</span>
                      </div>
                      <div class="flex items-center gap-1 font-mono text-[8px]">
                        <span>▲</span>
                        <span>{item.votes}</span>
                      </div>
                    </div>
                  {/each}
                </div>

                <!-- Sim Trigger -->
                <div class="w-full flex items-center justify-between px-4">
                  <!-- Trend readouts -->
                  <div class="px-2 py-1 bg-surface-2 dark:bg-surface-3 border border-border-custom/60 rounded-md font-mono text-[7px] font-bold text-text-secondary select-none">
                    {#if hasVoted}
                      <span class="text-brand-from animate-pulse">⚡ TRENDING_#02</span>
                    {:else}
                      <span>⚖️ FEED_STABLE</span>
                    {/if}
                  </div>

                  <!-- Upvote Simulator button -->
                  <button
                    onclick={handleStepVote}
                    class="relative px-3.5 py-1.5 rounded-lg border font-mono text-[8px] font-extrabold tracking-wider shadow-inner-custom cursor-pointer transition-all duration-200 active:scale-95 flex items-center gap-1.5
                           {hasVoted 
                             ? 'bg-gradient-to-br from-brand-from to-brand-to text-white border-brand-from/20 shadow-md' 
                             : 'bg-surface-3 dark:bg-surface-3/15 text-text-primary border-border-custom hover:border-brand-from/35 hover:bg-brand-from/5'}"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" class="w-2.5 h-2.5 {hasVoted ? 'text-white' : 'text-brand-from'}"><path d="m18 15-6-6-6 6"/></svg>
                    <span>{hasVoted ? 'VOTED' : 'UPVOTE'}</span>
                    <span class="px-1 py-0.25 rounded bg-surface/20 text-[7.5px] font-black">{voteCount}</span>
                  </button>
                </div>

              </div>

            {:else}
              <!-- Step 3: Growth Waveform Synthesizer -->
              <div class="w-full flex flex-col items-center gap-3">
                
                <!-- Analog Line oscilloscope Screen -->
                <div class="w-[90%] h-18 bg-surface-2 dark:bg-surface-3 border border-border-custom/60 rounded-lg relative overflow-hidden shadow-inner-custom select-none">
                  
                  <!-- Internal grid meshes -->
                  <svg class="absolute inset-0 w-full h-full text-border-custom/20 pointer-events-none" stroke="currentColor" stroke-width="0.5">
                    <line x1="0" y1="9" x2="180" y2="9" stroke-dasharray="2,2" />
                    <line x1="0" y1="18" x2="180" y2="18" stroke-dasharray="2,2" />
                    <line x1="0" y1="27" x2="180" y2="27" stroke-dasharray="2,2" />
                    <line x1="0" y1="36" x2="180" y2="36" stroke-dasharray="2,2" />
                    
                    <line x1="30" y1="0" x2="30" y2="50" stroke-dasharray="2,2" />
                    <line x1="60" y1="0" x2="60" y2="50" stroke-dasharray="2,2" />
                    <line x1="90" y1="0" x2="90" y2="50" stroke-dasharray="2,2" />
                    <line x1="120" y1="0" x2="120" y2="50" stroke-dasharray="2,2" />
                    <line x1="150" y1="0" x2="150" y2="50" stroke-dasharray="2,2" />
                  </svg>

                  <!-- Dynamic graph path curves -->
                  <svg class="w-full h-full overflow-visible" viewBox="0 0 100 40">
                    <path
                      d={paths[activeSource]}
                      stroke="url(#graphGrad)"
                      stroke-width="2"
                      fill="none"
                      class="transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]"
                    />
                    
                    <!-- Gliding trace particle -->
                    <circle r="2.5" fill="var(--brand-to)" class="shadow-sm">
                      <animateMotion dur="{3 / growVelocity}s" repeatCount="indefinite" path={paths[activeSource]} />
                    </circle>

                    <defs>
                      <linearGradient id="graphGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stop-color="var(--brand-from)" />
                        <stop offset="100%" stop-color="var(--brand-to)" />
                      </linearGradient>
                    </defs>
                  </svg>

                  <!-- Real-time specs coordinates overlaid inside monitor -->
                  <div class="absolute bottom-1 right-2 font-mono text-[6.5px] font-bold text-text-secondary/70">
                    RATE: {trafficRate.toLocaleString()}/m
                  </div>
                  <div class="absolute top-1 left-2 font-mono text-[6.5px] font-bold text-brand-from">
                    VEL: x{growVelocity.toFixed(1)}
                  </div>
                </div>

                <!-- Synthesizer interactive controls dials -->
                <div class="w-full flex items-center justify-between px-4 gap-2.5">
                  
                  <!-- Multiplier Dial Knob (Rotary Emulator) -->
                  <button
                    onclick={cycleVelocity}
                    class="flex items-center gap-1.5 bg-surface-2 dark:bg-surface-3 px-2 py-1 border border-border-custom/60 rounded-md hover:border-brand-from/40 cursor-pointer active:scale-95 transition-all duration-200"
                    title="Click to cycle growth speed dial"
                  >
                    <!-- Knob Circle with dynamic angle rotation -->
                    <svg 
                      class="w-3.5 h-3.5 text-text-secondary transition-transform duration-500 ease-out" 
                      viewBox="0 0 24 24" 
                      fill="none" 
                      stroke="currentColor" 
                      stroke-width="2.5"
                      style="transform: rotate({growVelocity === 1.0 ? 0 : growVelocity === 2.5 ? 120 : 240}deg);"
                    >
                      <circle cx="12" cy="12" r="9" fill="none" />
                      <!-- Indicator needle dot -->
                      <circle cx="12" cy="6" r="2.2" fill="var(--brand-from)" />
                    </svg>
                    <span class="font-mono text-[7px] font-extrabold text-text-secondary select-none">
                      SPD_DIAL
                    </span>
                  </button>

                  <!-- Source Select Segmented Tabs -->
                  <div class="flex items-center gap-1 bg-surface-2 dark:bg-surface-3 p-0.5 border border-border-custom/50 rounded-md">
                    {#each ['direct', 'community', 'viral'] as src}
                      <button
                        onclick={() => activeSource = src as any}
                        class="px-2 py-0.5 rounded text-[7.5px] font-mono font-bold uppercase transition-all duration-200 cursor-pointer
                               {activeSource === src 
                                 ? 'bg-brand-from text-white shadow-sm' 
                                 : 'text-text-secondary hover:text-brand-from'}"
                      >
                        {src.slice(0, 3)}
                      </button>
                    {/each}
                  </div>

                </div>

              </div>
            {/if}
            
          </div>

        </div>
      {/each}
    </div>
  </div>
</section>

<style>
  /* Custom micro-particle float up animation for Card 2 celebration burst */
  @keyframes celebration-float-up {
    0% {
      transform: translate3d(0, 0, 0) scale(0.6) rotate(0deg);
      opacity: 0;
    }
    15% {
      opacity: 1;
    }
    85% {
      opacity: 1;
    }
    100% {
      transform: translate3d(var(--x-drift), -90px, 0) scale(1.2) rotate(var(--spin-deg));
      opacity: 0;
    }
  }
</style>
