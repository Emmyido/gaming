/** What the buka at a rest stop serves, by region. Prices in in-game naira; energy restored 0..100. */
export const MENUS = {
  south: [
    { name: "Jollof rice & chicken", price: 3_500, energy: 55 },
    { name: "Amala, ewedu & gbegiri", price: 2_500, energy: 45 },
    { name: "Boli & groundnut", price: 800, energy: 20 },
    { name: "Cold zobo", price: 500, energy: 10 },
  ],
  savanna: [
    { name: "Pounded yam & egusi", price: 3_000, energy: 50 },
    { name: "Suya with onions & yaji", price: 2_000, energy: 35 },
    { name: "Masa & miyan taushe", price: 1_500, energy: 30 },
    { name: "Kunu", price: 400, energy: 10 },
  ],
  sahel: [
    { name: "Tuwo shinkafa & miyan kuka", price: 2_500, energy: 50 },
    { name: "Kilishi", price: 2_000, energy: 30 },
    { name: "Fura da nono", price: 700, energy: 20 },
    { name: "Kosai & koko", price: 600, energy: 15 },
  ],
  plateau: [
    { name: "Irish potato porridge", price: 2_200, energy: 45 },
    { name: "Acha & vegetable soup", price: 2_000, energy: 40 },
    { name: "Roasted corn & ube", price: 700, energy: 18 },
    { name: "Hot tea & bread", price: 600, energy: 15 },
  ],
};

export const GREETINGS = [
  "\"Welcome, oga! Food dey, fuel dey, rest dey. Wetin you go take?\"",
  "\"My customer! Sit down, rest your legs small.\"",
  "\"Fresh food just come down from fire. You go like am.\"",
];
