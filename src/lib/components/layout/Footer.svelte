<script lang="ts">
  const currentYear = new Date().getFullYear();
</script>

<footer class="relative w-full bg-surface-2 dark:bg-surface border-t border-border-custom/50 pt-20 pb-12 mt-20 transition-all duration-300 overflow-hidden">
  
  <!-- Faint blueprint grid background for seamless continuation -->
  <div class="absolute inset-0 blueprint-grid opacity-10 dark:opacity-20 pointer-events-none z-0"></div>

  <!-- Soft ambient glowing blob in the bottom right corner -->
  <div class="absolute bottom-0 right-0 w-[250px] h-[250px] rounded-full bg-brand-from/5 dark:bg-brand-from/[0.04] blur-[80px] pointer-events-none z-0"></div>

  <div class="max-w-7xl mx-auto px-6 relative z-10">
    <!-- Main Footer Grid -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-12 lg:gap-8 mb-16">
      
      <!-- Col 1: Brand & Craft Tagline -->
      <div class="lg:col-span-2 flex flex-col gap-4 text-left">
        <a href="/" class="flex items-center gap-2.5 w-fit">
          <div class="w-8 h-8 rounded-[10px] bg-gradient-to-br from-brand-from to-brand-to flex items-center justify-center shadow-md shadow-brand-from/10">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="3"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="w-3.5 h-3.5 text-white"
            >
              <path d="M12 22a7 7 0 0 0 7-7H5a7 7 0 0 0 7 7Z"/>
              <path d="M12 11V3"/>
              <path d="M9 3h6"/>
            </svg>
          </div>
          <span class="font-heading text-lg font-black tracking-tight text-text-primary">
            Tech<span class="bg-gradient-to-r from-brand-from to-brand-to bg-clip-text text-transparent">Tank</span>
          </span>
        </a>
        <p class="font-body text-xs sm:text-sm text-text-secondary leading-relaxed max-w-sm">
          A warm, community-driven discovery hub. Join us in spotlighting beautiful hardware-grade products, celebrating software as an <span class="font-display italic font-medium text-brand-from text-[15px]">art form</span>.
        </p>
      </div>

      <!-- Col 2: Product links -->
      <div class="flex flex-col gap-4 text-left">
        <h4 class="font-heading text-xs font-black uppercase tracking-widest text-text-primary select-none flex items-center gap-1.5">
          <span>⚙️</span> Product
        </h4>
        <div class="flex flex-col gap-3">
          {#each [
            { label: 'Browse Products', href: '#products' },
            { label: 'Submit Product', href: '#newsletter' },
            { label: 'Top Categories', href: '#products' },
            { label: 'Trending Now', href: '#products' }
          ] as link}
            <a 
              href={link.href} 
              class="group font-body text-xs text-text-secondary hover:text-brand-from flex items-center w-fit transition-all duration-200 hover:translate-x-1"
            >
              <span class="opacity-0 w-0 group-hover:w-2 group-hover:opacity-100 transition-all duration-200 text-brand-from font-mono text-[8px] mr-1">[</span>
              {link.label}
              <span class="opacity-0 w-0 group-hover:w-2 group-hover:opacity-100 transition-all duration-200 text-brand-from font-mono text-[8px] ml-1">]</span>
            </a>
          {/each}
        </div>
      </div>

      <!-- Col 3: Company links -->
      <div class="flex flex-col gap-4 text-left">
        <h4 class="font-heading text-xs font-black uppercase tracking-widest text-text-primary select-none flex items-center gap-1.5">
          <span>🛡️</span> Company
        </h4>
        <div class="flex flex-col gap-3">
          {#each [
            { label: 'About Us', href: '#about' },
            { label: 'Maker Blog', href: '#about' },
            { label: 'Careers', href: '#about' },
            { label: 'Press Kit', href: '#about' }
          ] as link}
            <a 
              href={link.href} 
              class="group font-body text-xs text-text-secondary hover:text-brand-from flex items-center w-fit transition-all duration-200 hover:translate-x-1"
            >
              <span class="opacity-0 w-0 group-hover:w-2 group-hover:opacity-100 transition-all duration-200 text-brand-from font-mono text-[8px] mr-1">[</span>
              {link.label}
              <span class="opacity-0 w-0 group-hover:w-2 group-hover:opacity-100 transition-all duration-200 text-brand-from font-mono text-[8px] ml-1">]</span>
            </a>
          {/each}
        </div>
      </div>

      <!-- Col 4: Retro Squircle Social Keys -->
      <div class="flex flex-col gap-4 text-left">
        <h4 class="font-heading text-xs font-black uppercase tracking-widest text-text-primary select-none flex items-center gap-1.5">
          <span>📡</span> Connect
        </h4>
        
        <!-- Physical layout square keys rows -->
        <div class="flex items-center gap-2.5">
          <a 
            href="https://twitter.com" 
            target="_blank" 
            rel="noopener noreferrer" 
            class="w-9 h-9 rounded-[10px] bg-surface dark:bg-surface-3 border border-border-custom flex items-center justify-center text-text-secondary hover:text-brand-from hover:border-brand-from/35 hover:scale-105 active:scale-95 transition-all duration-200 shadow-[0_1px_2px_rgba(0,0,0,0.02)]"
            title="Twitter / X"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z"/></svg>
          </a>

          <a 
            href="https://github.com" 
            target="_blank" 
            rel="noopener noreferrer" 
            class="w-9 h-9 rounded-[10px] bg-surface dark:bg-surface-3 border border-border-custom flex items-center justify-center text-text-secondary hover:text-brand-from hover:border-brand-from/35 hover:scale-105 active:scale-95 transition-all duration-200 shadow-[0_1px_2px_rgba(0,0,0,0.02)]"
            title="GitHub"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/></svg>
          </a>

          <a 
            href="https://discord.com" 
            target="_blank" 
            rel="noopener noreferrer" 
            class="w-9 h-9 rounded-[10px] bg-surface dark:bg-surface-3 border border-border-custom flex items-center justify-center text-text-secondary hover:text-brand-from hover:border-brand-from/35 hover:scale-105 active:scale-95 transition-all duration-200 shadow-[0_1px_2px_rgba(0,0,0,0.02)]"
            title="Discord"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 12h8"/><path d="M12 8v8"/></svg>
          </a>
        </div>
      </div>

    </div>

    <!-- Divider line sitting perfectly flush and flat -->
    <div class="h-[1px] bg-border-custom/50 mb-8 w-full"></div>

    <!-- Bottom Bar -->
    <div class="flex flex-col md:flex-row items-center justify-between gap-6">
      
      <!-- Copyright -->
      <div class="flex flex-col sm:flex-row items-center gap-2 sm:gap-3 text-center sm:text-left">
        <p class="font-body text-xs text-text-secondary">
          &copy; {currentYear} TechTank Inc. All rights reserved.
        </p>
      </div>

      <!-- Compliance & Handcrafted stamp -->
      <div class="flex flex-wrap items-center justify-center gap-6 text-xs text-text-secondary">
        <a href="#privacy" class="hover:text-brand-from transition-colors duration-200">Privacy Policy</a>
        <a href="#terms" class="hover:text-brand-from transition-colors duration-200">Terms of Service</a>
        <span class="inline-flex items-center gap-1 font-mono text-[10px] text-text-secondary/70">
          Built with <span class="text-brand-from animate-pulse">❤️</span> by builders
        </span>
      </div>

    </div>
  </div>
</footer>
