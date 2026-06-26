export type Maker = {
  id: string;
  name: string;
  handle: string;
  avatar: string;
  productsCount: number;
  topProduct?: string;
  topProductVotes?: number;
};

export type Product = {
  id: string;
  name: string;
  tagline: string;
  iconBg: string; // Gradient class for icon background
  iconText: string; // Initials or short symbol
  tags: string[];
  upvotes: number;
  comments: number;
  maker: Maker;
  featured?: boolean;
  isNew?: boolean;
  makerPitch?: string; // Human maker's personal pitch quote
};

export const MAKERS: Maker[] = [
  {
    id: '1',
    name: 'Elena Rostova',
    handle: 'elenacodes',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&h=150&q=80',
    productsCount: 4,
    topProduct: 'Zenith Editor',
    topProductVotes: 342
  },
  {
    id: '2',
    name: 'Marcus Vance',
    handle: 'marcus_v',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&h=150&q=80',
    productsCount: 7,
    topProduct: 'SpectraDB',
    topProductVotes: 512
  },
  {
    id: '3',
    name: 'Aiko Tanaka',
    handle: 'aiko_t',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&h=150&q=80',
    productsCount: 3,
    topProduct: 'PulseFlow',
    topProductVotes: 219
  },
  {
    id: '4',
    name: 'Devon Harris',
    handle: 'devonh',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=150&h=150&q=80',
    productsCount: 5,
    topProduct: 'Draftboard',
    topProductVotes: 188
  },
  {
    id: '5',
    name: 'Siddharth Nair',
    handle: 'sid_dev',
    avatar: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=150&h=150&q=80',
    productsCount: 6,
    topProduct: 'KubeLens',
    topProductVotes: 429
  }
];

export const PRODUCTS: Product[] = [
  {
    id: 'p1',
    name: 'Zenith Editor',
    tagline: 'An AI-powered distraction-free editor for technical writers.',
    iconBg: 'from-purple-500 to-indigo-600',
    iconText: 'Ze',
    tags: ['AI', 'Productivity'],
    upvotes: 342,
    comments: 24,
    maker: MAKERS[0],
    featured: true,
    isNew: false,
    makerPitch: '“Built this to solve my own distraction blocks while drafting technical manuals!”'
  },
  {
    id: 'p2',
    name: 'PulseFlow',
    tagline: 'Micro-analytics that run on the edge with 0ms overhead.',
    iconBg: 'from-emerald-400 to-teal-600',
    iconText: 'Pf',
    tags: ['Developer Tools', 'Open Source'],
    upvotes: 219,
    comments: 14,
    maker: MAKERS[2],
    featured: true,
    isNew: true,
    makerPitch: '“No cookies, no database bloat. 100% privacy-first analytics for creators.”'
  },
  {
    id: 'p3',
    name: 'SpectraDB',
    tagline: 'Zero-config serverless database for high-throughput AI workloads.',
    iconBg: 'from-amber-500 to-rose-600',
    iconText: 'Sp',
    tags: ['Developer Tools', 'AI'],
    upvotes: 512,
    comments: 48,
    maker: MAKERS[1],
    featured: true,
    isNew: false,
    makerPitch: '“Serverless databases shouldn’t require cold starts. Run your vectors in 1ms.”'
  },
  {
    id: 'p4',
    name: 'Draftboard',
    tagline: 'Realtime infinite digital whiteboard built specifically for developers.',
    iconBg: 'from-cyan-400 to-blue-600',
    iconText: 'Db',
    tags: ['Design', 'Productivity'],
    upvotes: 188,
    comments: 8,
    maker: MAKERS[3],
    featured: false,
    isNew: true,
    makerPitch: '“Built a digital canvas for dev architecture wireframing without design bloat.”'
  },
  {
    id: 'p5',
    name: 'KubeLens',
    tagline: 'Lightweight kubernetes cluster visualization in your terminal.',
    iconBg: 'from-blue-500 to-indigo-700',
    iconText: 'Kl',
    tags: ['Developer Tools', 'Open Source'],
    upvotes: 429,
    comments: 31,
    maker: MAKERS[4],
    featured: true,
    isNew: false,
    makerPitch: '“Tired of complex web dashboards. See your pods directly in terminal columns.”'
  },
  {
    id: 'p6',
    name: 'EmberUI',
    tagline: 'Warm tactile skeuomorphic React and Svelte component library.',
    iconBg: 'from-orange-500 to-amber-600',
    iconText: 'Em',
    tags: ['Design', 'Developer Tools'],
    upvotes: 295,
    comments: 19,
    maker: MAKERS[0],
    featured: false,
    isNew: false,
    makerPitch: '“Component libraries became flat and boring. Let’s bring back bevel details!”'
  },
  {
    id: 'p7',
    name: 'TypeTail',
    tagline: 'Auto-generate full TypeScript typings from your CSS class variables.',
    iconBg: 'from-pink-500 to-rose-500',
    iconText: 'Tt',
    tags: ['Developer Tools'],
    upvotes: 112,
    comments: 5,
    maker: MAKERS[2],
    featured: false,
    isNew: true,
    makerPitch: '“Automatically parses layout variables to give you type safety without builds.”'
  },
  {
    id: 'p8',
    name: 'DevSpace',
    tagline: 'Remote sandbox environments configured with one line of YAML.',
    iconBg: 'from-violet-500 to-fuchsia-600',
    iconText: 'Ds',
    tags: ['Developer Tools'],
    upvotes: 236,
    comments: 12,
    maker: MAKERS[1],
    featured: false,
    isNew: false,
    makerPitch: '“Set up remote test sandboxes in 5 seconds flat with zero configuration logs.”'
  }
];
