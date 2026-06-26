<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    variant = 'primary',
    size = 'md',
    href,
    disabled = false,
    type = 'button',
    onclick,
    class: className = '',
    children
  }: {
    variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
    size?: 'sm' | 'md' | 'lg';
    href?: string;
    disabled?: boolean;
    type?: 'button' | 'submit' | 'reset';
    onclick?: (e: MouseEvent) => void;
    class?: string;
    children?: Snippet;
  } = $props();

  const baseStyles = 'inline-flex items-center justify-center font-body font-medium rounded-[10px] leading-tight transition-all duration-200 cursor-pointer select-none active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none';
  
  const variants = {
    primary: 'bg-gradient-to-br from-brand-from to-brand-to text-white shadow-cta shadow-[inset_0_1.5px_3px_rgba(255,255,255,0.35),_inset_0_-1.5px_3px_rgba(0,0,0,0.2)] hover:shadow-[0_6px_24px_rgba(232,89,60,0.45)] hover:-translate-y-0.5 border border-brand-from/20',
    secondary: 'bg-surface text-text-primary border border-border-custom shadow-card hover:shadow-card-hover hover:-translate-y-0.5',
    outline: 'bg-transparent text-text-primary border-2 border-text-primary/12 dark:border-text-primary/18 hover:border-brand-from/80 hover:text-brand-from hover:bg-brand-from/[0.03] shadow-sm',
    ghost: 'bg-transparent text-text-secondary hover:text-text-primary hover:bg-surface-3'
  };

  const sizes = {
    sm: 'px-3 py-1 text-[11px]',
    md: 'px-4 py-1.5 text-xs sm:text-sm',
    lg: 'px-5.5 py-2 text-sm sm:text-base'
  };
</script>

{#if href}
  <a
    {href}
    class="{baseStyles} {variants[variant]} {sizes[size]} {className}"
  >
    {#if children}
      {@render children()}
    {/if}
  </a>
{:else}
  <button
    {type}
    {disabled}
    {onclick}
    class="{baseStyles} {variants[variant]} {sizes[size]} {className}"
  >
    {#if children}
      {@render children()}
    {/if}
  </button>
{/if}
