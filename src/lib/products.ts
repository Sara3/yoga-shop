export interface Product {
  id: string;
  name: string;
  price_cents: number;
  price_display: string;
}

export const products: Product[] = [
  {
    id: 'mat',
    name: 'Yoga Mat',
    price_cents: 2999, // $29.99
    price_display: '$29.99',
  },
  {
    id: 'strap',
    name: 'Yoga Strap',
    price_cents: 1299, // $12.99
    price_display: '$12.99',
  },
];

export function getProduct(id: string): Product | undefined {
  return products.find((p) => p.id === id);
}
