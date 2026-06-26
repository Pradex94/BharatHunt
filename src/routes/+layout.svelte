<script lang="ts">
  import './layout.css';
  import Navbar from '$lib/components/layout/Navbar.svelte';
  import Footer from '$lib/components/layout/Footer.svelte';

  let { children } = $props();
</script>

<div class="min-h-screen flex flex-col transition-all duration-300">
  <!-- Navbar Header -->
  <Navbar />
  
  <!-- Main Contents -->
  <main class="flex-grow">
    {@render children()}
  </main>
  
  <!-- Footer section -->
  <Footer />
</div>
