/**
 * Yoga classes. Preview/full URLs can be overridden via env for production:
 * CLASS_1_PREVIEW_URL, CLASS_1_FULL_URL, CLASS_2_PREVIEW_URL, CLASS_2_FULL_URL, CLASS_3_PREVIEW_URL, CLASS_3_FULL_URL.
 */

const raw = process.env;

export interface YogaClass {
  id: string;
  title: string;
  price: string;
  price_usdc: number; // Deprecated: kept for backward compatibility
  price_cents: number; // Price in cents for Stripe
  preview_url: string;
  full_url: string;
}

// Default videos from Yoga with Adriene channel
const defaultVideos: Record<string, string> = {
  '1': 'https://www.youtube.com/watch?v=OMu6OKF5Z1k', // Morning Flow - Yoga Morning Fresh
  '2': 'https://www.youtube.com/watch?v=ZbtVVYBLCug', // Power Yoga - 20 Minute Intermediate Power Yoga
  '3': 'https://www.youtube.com/watch?v=AF9d2Icl4fA', // Flexibility - Yoga Stretch
  '4': 'https://www.youtube.com/watch?v=j8bEWn2E9uo', // Flexibility - Short Wake Up Flow
};

// Convert YouTube watch URL to embed with 20-second end time for full videos
function addTimeLimit(url: string, endSeconds: number): string {
  // If it's a YouTube watch URL, convert to embed format with end parameter
  if (url.includes('youtube.com/watch')) {
    const videoId = url.match(/[?&]v=([^&]+)/)?.[1];
    if (videoId) {
      return `https://www.youtube.com/embed/${videoId}?end=${endSeconds}&autoplay=1`;
    }
  }
  // If already embed or other format, add end parameter if possible
  if (url.includes('youtube.com/embed')) {
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}end=${endSeconds}&autoplay=1`;
  }
  // For non-YouTube URLs, return as-is (player should handle time limit)
  return url;
}

function url(id: string, kind: 'preview' | 'full'): string {
  const key = `CLASS_${id}_${kind.toUpperCase()}_URL`;
  // Use env var if set, otherwise use default video for this class
  const baseUrl = (raw[key] as string) || defaultVideos[id] || defaultVideos['1'];
  // For full videos, add 20-second time limit
  if (kind === 'full') {
    return addTimeLimit(baseUrl, 20);
  }
  return baseUrl;
}

// Helper function to randomly assign $1 or $2
function randomPrice(): { price: string; price_usdc: number; price_cents: number } {
  const price_usdc = Math.random() < 0.5 ? 1 : 2;
  const price_cents = price_usdc * 100; // Convert to cents for Stripe
  return {
    price: `$${price_usdc}.00`,
    price_usdc,
    price_cents,
  };
}

export const classes: YogaClass[] = [
  {
    id: '1',
    title: 'Morning Flow',
    ...randomPrice(),
    preview_url: url('1', 'preview'),
    full_url: url('1', 'full'), // Same video, stops at 20 seconds
  },
  {
    id: '2',
    title: 'Power Yoga',
    ...randomPrice(),
    preview_url: url('2', 'preview'),
    full_url: url('2', 'full'), // Same video, stops at 20 seconds
  },
  {
    id: '3',
    title: 'Flexibility',
    ...randomPrice(),
    preview_url: url('3', 'preview'),
    full_url: url('3', 'full'), // Same video, stops at 20 seconds
  },
  {
    id: '4',
    title: 'Flexibility',
    ...randomPrice(),
    preview_url: url('4', 'preview'),
    full_url: url('4', 'full'), // Same video, stops at 20 seconds
  }
];

export function getClass(id: string): YogaClass | undefined {
  return classes.find((c) => c.id === id);
}
