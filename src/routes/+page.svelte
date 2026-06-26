<script lang="ts">
  import Hero from '$lib/components/landing/Hero.svelte';
  import CreativeBlueprintGrid from '$lib/components/landing/CreativeBlueprintGrid.svelte';
  import FeaturedProducts from '$lib/components/landing/FeaturedProducts.svelte';
  import HowItWorks from '$lib/components/landing/HowItWorks.svelte';
  import MakerSpotlight from '$lib/components/landing/MakerSpotlight.svelte';
  import MakerJoinForm from '$lib/components/landing/MakerJoinForm.svelte';
  import NewsletterCTA from '$lib/components/landing/NewsletterCTA.svelte';

  // Svelte Action for Client-Safe Scroll Reveal Entrance (With Staggered Children & Cleanup)
  function scrollReveal(node: HTMLElement) {
    if (typeof window === 'undefined') return;

    // Check prefers-reduced-motion
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion || !('IntersectionObserver' in window)) {
      node.classList.add('reveal-visible');
      node.querySelectorAll('.reveal-item').forEach((item) => {
        item.classList.add('reveal-visible');
      });
      return;
    }

    const items = Array.from(node.querySelectorAll('.reveal-item'));
    const targets = items.length > 0 ? items : [node];

    // Initialize all targets in hidden state
    targets.forEach((el) => {
      el.classList.add('reveal-hidden');
    });

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            targets.forEach((el, index) => {
              const htmlEl = el as HTMLElement;
              // Stagger delay of 80ms per item
              htmlEl.style.transitionDelay = `${index * 80}ms`;
              
              // Move from hidden to visible state
              htmlEl.classList.remove('reveal-hidden');
              htmlEl.classList.add('reveal-visible');

              // Clean up styles and classes after transition finishes to ensure perfect interactive performance
              setTimeout(() => {
                htmlEl.style.transitionDelay = '';
                htmlEl.classList.remove('reveal-visible');
                htmlEl.classList.remove('reveal-hidden');
              }, 1500 + index * 80);
            });

            observer.unobserve(node);
          }
        });
      },
      {
        threshold: 0.05,
        rootMargin: '0px 0px -50px 0px' // Compensate offset baseline
      }
    );

    observer.observe(node);

    return {
      destroy() {
        observer.disconnect();
      }
    };
  }
</script>

<!-- SEO Meta Tags -->
<svelte:head>
  <title>TechTank — Community-Driven Product Discovery Platform</title>
  <meta name="description" content="A warm, flat-skeuomorphic discovery hub for software makers, developers, designers, and enthusiasts. Discover premium new products and vote on what matters." />
  <meta name="keywords" content="product hunt, indie hacker, software, tools, web development, svelte kit, tailwindcss" />
  <meta name="author" content="TechTank Inc." />
  
  <!-- Open Graph / Facebook -->
  <meta property="og:type" content="website" />
  <meta property="og:title" content="TechTank — Community-Driven Product Discovery Platform" />
  <meta property="og:description" content="A warm, flat-skeuomorphic discovery hub for software makers, developers, designers, and enthusiasts." />
  <meta property="og:image" content="https://techtank.app/og-image.png" />
  
  <!-- Twitter -->
  <meta property="twitter:card" content="summary_large_image" />
  <meta property="twitter:title" content="TechTank — Community-Driven Product Discovery Platform" />
  <meta property="twitter:description" content="A warm, flat-skeuomorphic discovery hub for software makers, developers, designers, and enthusiasts." />
  <meta property="twitter:image" content="https://techtank.app/og-image.png" />
</svelte:head>

<!-- Landing Page Layout -->
<div class="relative w-full overflow-hidden flex flex-col gap-4">
  <!-- Hero Column (Visible at initial paint - no scroll anim to optimize LCP) -->
  <Hero />

  <!-- Creative Spec Loop Carousel (Directly follows Hero - immediate visible load) -->
  <CreativeBlueprintGrid />

  <!-- Featured Products feed (Animate scroll entrance) -->
  <div use:scrollReveal>
    <FeaturedProducts />
  </div>

  <!-- Maker Spotlights (Animate scroll entrance) -->
  <div use:scrollReveal>
    <MakerSpotlight />
  </div>

  <!-- Maker Join Form Registry (Animate scroll entrance) -->
  <div use:scrollReveal>
    <MakerJoinForm />
  </div>

  <!-- How It Works (Animate scroll entrance) -->
  <div use:scrollReveal>
    <HowItWorks />
  </div>

  <!-- Newsletter waitlist Capture (Animate scroll entrance) -->
  <div use:scrollReveal>
    <NewsletterCTA />
  </div>
</div>
