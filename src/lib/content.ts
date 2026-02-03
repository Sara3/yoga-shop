export interface YogaClass {
  id: string;
  title: string;
  price: string;
  price_usdc: number;
  preview_url: string;
  full_url: string;
}

export const classes: YogaClass[] = [
  {
    id: '1',
    title: 'Morning Flow',
    price: '$1.00',
    price_usdc: 1,
    preview_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    full_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  },
  {
    id: '2',
    title: 'Power Yoga',
    price: '$2.00',
    price_usdc: 2,
    preview_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    full_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  },
  {
    id: '3',
    title: 'Flexibility',
    price: '$3.00',
    price_usdc: 3,
    preview_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    full_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  },
];

export function getClass(id: string): YogaClass | undefined {
  return classes.find((c) => c.id === id);
}
