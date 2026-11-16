import { db, nowIso } from './db.js';

const IMG = (id) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=600&q=80`;

const PRODUCTS = [
  // Pizza
  ['Pizza Margherita', 'Tomate, mozzarella fior di latte, basilic frais', 950, 'Pizza', IMG('photo-1513104890138-7c749659a591')],
  ['Pizza Pepperoni', 'Tomate, mozzarella, pepperoni épicé, origan', 1250, 'Pizza', IMG('photo-1628840042765-356cda07504e')],
  // Burger
  ['Burger Classique', 'Steak haché, cheddar, salade, tomate, sauce maison', 1150, 'Burger', IMG('photo-1568901346375-23c9450c58cd')],
  ['Burger Bacon', 'Steak haché, bacon croustillant, cheddar fondu, oignons', 1350, 'Burger', IMG('photo-1550547660-d9450f859349')],
  // Sushi
  ['Sushi Saumon (8 pièces)', 'Riz vinaigré, saumon frais, wasabi, gingembre', 1450, 'Sushi', IMG('photo-1579871494447-9811cf80d66c')],
  ['Maki Avocado (8 pièces)', 'Avocado, concombre, graines de sésame, sauce soja', 950, 'Sushi', IMG('photo-1617196034796-73dfa7b1fd56')],
  // Dessert
  ['Tiramisu', 'Mascarpone, café espresso, cacao amer, biscuits', 650, 'Dessert', IMG('photo-1571877227200-a0d98ea607e9')],
  ['Glace Vanille', 'Deux boules de vanille de Madagascar, coulis fruits rouges', 450, 'Dessert', IMG('photo-1551024506-0bccd828d307')],
  // Boisson
  ['Limonade Maison', 'Citrons pressés, menthe fraîche, glace, sirop de sucre de canne', 400, 'Boisson', IMG('photo-1544145945-f90425340c7e')],
  ["Jus d'Orange Frais", 'Oranges pressées à la commande, sans sucres ajoutés', 450, 'Boisson', IMG('photo-1600271886742-f449904d2b78')],
];

/** Seed : ~10 produits si la table products est vide (premier lancement). */
export function seedIfEmpty() {
  const count = db.prepare('SELECT COUNT(*) AS n FROM products').get().n;
  if (count > 0) return 0;
  const insert = db.prepare(
    'INSERT INTO products (name, description, price_cents, category, image_url, available, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)'
  );
  const ts = nowIso();
  const tx = db.transaction(() => {
    for (const [name, description, priceCents, category, imageUrl] of PRODUCTS) {
      insert.run(name, description, priceCents, category, imageUrl, ts);
    }
  });
  tx();
  return PRODUCTS.length;
}
