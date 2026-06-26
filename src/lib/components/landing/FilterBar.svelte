<script lang="ts">
  let {
    activeFilter = $bindable('All'),
    categories = ['All', 'Developer Tools', 'Productivity', 'Design', 'AI', 'Open Source']
  }: {
    activeFilter?: string;
    categories?: string[];
  } = $props();
</script>

<div class="w-full flex items-center justify-start mb-8 mt-2 overflow-x-auto no-scrollbar">
  <!-- Premium Chip-Style Tabs Row -->
  <div class="flex items-center gap-2.5 py-1 whitespace-nowrap">
    {#each categories as category}
      <button
        type="button"
        onclick={() => activeFilter = category}
        class="px-4.5 py-2 text-xs sm:text-[13px] font-semibold rounded-xl border select-none cursor-pointer whitespace-nowrap transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-95
          {activeFilter === category
            ? 'bg-brand-from text-white border-brand-from shadow-[0_3px_10px_rgba(232,89,60,0.18)] font-bold scale-[1.01]'
            : 'bg-surface dark:bg-surface-2 text-text-secondary border-border-custom/50 hover:border-brand-from/30 hover:text-brand-from hover:bg-surface-2 dark:hover:bg-surface-3/20'
          }"
      >
        {category}
      </button>
    {/each}
  </div>
</div>

<style>
  button {
    -webkit-tap-highlight-color: transparent;
    outline: none;
  }
</style>
