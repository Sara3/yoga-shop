/**
 * Yoga classes. Preview/full URLs can be overridden via env for production:
 * CLASS_1_PREVIEW_URL, CLASS_1_FULL_URL, CLASS_2_PREVIEW_URL, CLASS_2_FULL_URL, CLASS_3_PREVIEW_URL, CLASS_3_FULL_URL.
 */

const raw = process.env;

export interface YogaClass {
  id: string;
  title: string;
  price: string;
  price_usdc: number;
  preview_url: string;
  full_url: string;
}

const defaultPreview = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const defaultFull = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

function url(id: string, kind: 'preview' | 'full'): string {
  const key = `CLASS_${id}_${kind.toUpperCase()}_URL`;
  return (raw[key] as string) || (kind === 'preview' ? defaultPreview : defaultFull);
}

export const classes: YogaClass[] = [
  {
    id: '1',
    title: 'Morning Flow',
    price: '$1.00',
    price_usdc: 1,
    preview_url: url('1', 'preview'),
    full_url: url('1', 'full'),
  },
  {
    id: '2',
    title: 'Power Yoga',
    price: '$2.00',
    price_usdc: 2,
    preview_url: url('2', 'preview'),
    full_url: url('2', 'full'),
  },
  {
    id: '3',
    title: 'Flexibility',
    price: '$3.00',
    price_usdc: 3,
    preview_url: url('3', 'preview'),
    full_url: url('3', 'full'),
  },
];

export function getClass(id: string): YogaClass | undefined {
  return classes.find((c) => c.id === id);
}
