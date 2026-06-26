<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    variant = 'secondary',
    children
  }: {
    variant?: 'primary' | 'secondary' | 'warning' | 'success';
    children?: Snippet;
  } = $props();

  const baseStyles = 'inline-flex items-center px-2.5 py-0.5 rounded-full font-mono text-[10px] font-extrabold tracking-wider uppercase select-none border shadow-[0_1px_2px_rgba(0,0,0,0.02)] transition-all duration-300';
  
  const variants = {
    primary: 'bg-gradient-to-br from-brand-from/10 to-brand-to/5 text-brand-from border-brand-from/20 dark:border-brand-from/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.4)] dark:shadow-none hover:border-brand-from/40',
    secondary: 'bg-surface-3/80 dark:bg-surface-3/30 text-text-secondary border-border-custom hover:text-text-primary hover:border-text-secondary/30',
    warning: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 dark:border-amber-500/35 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] dark:shadow-none',
    success: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 dark:border-emerald-500/35 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] dark:shadow-none'
  };
</script>

<span class="{baseStyles} {variants[variant]}">
  {#if children}
    {@render children()}
  {/if}
</span>
