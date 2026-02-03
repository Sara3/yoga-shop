export interface Product {
  id: string;
  name: string;
  price_cents: number;
  price_display: string;
  product_display_url: string;
}

export const products: Product[] = [
  {
    id: 'mat',
    name: 'Yoga Mat',
    price_cents: 2999, // $29.99
    price_display: '$29.99',
    product_display_url: 'https://images.bauerhosting.com/affiliates/sites/8/2024/02/offer-2024-02-28T145108.389.jpg?auto=format&w=1440&q=80',
  },
  {
    id: 'strap',
    name: 'Yoga Strap',
    price_cents: 1299, // $12.99
    price_display: '$12.99',
    product_display_url: 'https://www.ob-fit.com/wp-content/uploads/2022/03/Yoga-Strap.jpg',
  },
];

export function getProduct(id: string): Product | undefined {
  return products.find((p) => p.id === id);
}
