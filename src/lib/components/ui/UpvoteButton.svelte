<script lang="ts">
  let {
    count = $bindable(0),
    active = $bindable(false),
    onvote
  }: {
    count?: number;
    active?: boolean;
    onvote?: (active: boolean) => void;
  } = $props();

  let clicking = $state(false);

  function handleClick(e: MouseEvent) {
    e.stopPropagation();
    clicking = true;
    setTimeout(() => { clicking = false; }, 200);

    active = !active;
    if (active) {
      count += 1;
    } else {
      count -= 1;
    }
    if (onvote) {
      onvote(active);
    }
  }
</script>

<button
  type="button"
  onclick={handleClick}
  class="group inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-[10px] border font-mono text-xs font-bold select-none transition-all duration-200 cursor-pointer active:scale-90
    {active 
      ? 'bg-gradient-to-br from-brand-from to-brand-to text-white border-brand-from/20 shadow-cta' 
      : 'bg-surface text-text-secondary border-border-custom hover:border-brand-from/30 hover:text-brand-from shadow-inner-custom hover:bg-surface-3'
    } {clicking ? 'scale-95' : ''}"
  aria-label="Upvote product"
  aria-pressed={active}
>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="3"
    stroke-linecap="round"
    stroke-linejoin="round"
    class="w-3.5 h-3.5 transition-transform duration-300 {active ? 'stroke-white rotate-0' : 'group-hover:-translate-y-0.5'}"
  >
    <path d="m18 15-6-6-6 6"/>
  </svg>
  <span class="tabular-nums">{count}</span>
</button>
