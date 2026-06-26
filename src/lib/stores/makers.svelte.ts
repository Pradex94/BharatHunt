import { browser } from '$app/environment';
import { MAKERS, type Maker } from '$lib/data/products';

const CURATED_AVATARS = [
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&h=150&q=80',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&h=150&q=80',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&h=150&q=80',
  'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=150&h=150&q=80',
  'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=150&h=150&q=80',
  'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=150&h=150&q=80',
  'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?auto=format&fit=crop&w=150&h=150&q=80',
  'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=150&h=150&q=80',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=150&h=150&q=80',
  'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=150&h=150&q=80'
];

class MakersStore {
  list = $state<Maker[]>([]);

  constructor() {
    if (browser) {
      const stored = localStorage.getItem('techtank_makers');
      if (stored) {
        try {
          this.list = JSON.parse(stored);
        } catch {
          this.list = [...MAKERS];
        }
      } else {
        this.list = [...MAKERS];
        localStorage.setItem('techtank_makers', JSON.stringify(this.list));
      }
    } else {
      this.list = [...MAKERS];
    }
  }

  addMaker(name: string, email: string, platformUrl: string) {
    // Generate clean username/handle from name
    const cleanHandle = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]/g, '_')
      .replace(/_+/g, '_')
      .substring(0, 15);

    // Extract a clean product display name from platform URL
    let productDisplayName = 'My Platform';
    try {
      const urlObj = new URL(platformUrl.startsWith('http') ? platformUrl : `https://${platformUrl}`);
      const hostnameParts = urlObj.hostname.replace('www.', '').split('.');
      if (hostnameParts.length > 0) {
        productDisplayName = hostnameParts[0].charAt(0).toUpperCase() + hostnameParts[0].slice(1);
      }
    } catch {
      productDisplayName = 'Platform';
    }

    // Select random avatar from list
    const randomAvatar = CURATED_AVATARS[Math.floor(Math.random() * CURATED_AVATARS.length)];

    const newMaker: Maker = {
      id: `m_${Date.now()}`,
      name: name.trim(),
      handle: cleanHandle || 'anon_maker',
      avatar: randomAvatar,
      productsCount: 1,
      topProduct: productDisplayName,
      topProductVotes: 1
    };

    // Prepend to show up first in the list
    this.list = [newMaker, ...this.list];

    if (browser) {
      localStorage.setItem('techtank_makers', JSON.stringify(this.list));
      
      // Save full registration info including email for mock waitlist
      const registrations = JSON.parse(localStorage.getItem('techtank_registrations') || '[]');
      registrations.push({
        id: newMaker.id,
        name: newMaker.name,
        email: email.trim(),
        platformUrl: platformUrl.trim(),
        timestamp: new Date().toISOString()
      });
      localStorage.setItem('techtank_registrations', JSON.stringify(registrations));
    }

    return newMaker;
  }
}

export const makersStore = new MakersStore();
