import { DataSource } from 'typeorm';
import { Category } from 'src/modules/categories/entities/category.entity';
import { AppDataSource } from 'src/config/database.config';

/**
 * Mahaseel — Category Seeder
 *
 * Icons sourced from Twemoji (free, open-source emoji set via JSDelivr CDN).
 * No attribution required, zero-cost, and universally recognizable.
 *
 * Two-level hierarchy:
 *   Level 1 — parent categories (parentId = null)
 *   Level 2 — sub-categories     (parentId = parent slug lookup)
 *
 * Run:
 *   npx ts-node -r tsconfig-paths/register src/database/seeds/category.seed.ts
 *
 * Or wire into a Seeder runner:
 *   npx typeorm-extension seed:run
 */

// ─── Icon CDN ──────────────────────────────────────────────────────────────────
// Using Twemoji from JSDelivr (free, no attribution, high availability).
// Format: https://cdn.jsdelivr.net/npm/twemoji@14/dist/svg/{unicode-code}.svg

const ICON_CDN = 'https://cdn.jsdelivr.net/npm/twemoji@14/dist/svg';

const icon = (unicode: string) => `${ICON_CDN}/${unicode}.svg`;

// ─── Seed data ────────────────────────────────────────────────────────────────

interface CategorySeedRow {
  nameAr: string;
  nameEn: string;
  slug: string;
  sortOrder: number;
  iconCode: string; // Twemoji unicode code (e.g., '1f96c' for 🥬)
  parentSlug?: string;
}

const SEED_DATA: CategorySeedRow[] = [
  // ── 1. Vegetables ──────────────────────────────────────────────────────────
  {
    nameAr: 'خضروات',
    nameEn: 'Vegetables',
    slug: 'vegetables',
    sortOrder: 1,
    iconCode: '1f96c', // 🥬
  },
  {
    nameAr: 'طماطم',
    nameEn: 'Tomatoes',
    slug: 'tomatoes',
    sortOrder: 1,
    iconCode: '1f345',
    parentSlug: 'vegetables',
  },
  {
    nameAr: 'خيار',
    nameEn: 'Cucumbers',
    slug: 'cucumbers',
    sortOrder: 2,
    iconCode: '1f952',
    parentSlug: 'vegetables',
  },
  {
    nameAr: 'فلفل',
    nameEn: 'Bell Peppers',
    slug: 'bell-peppers',
    sortOrder: 3,
    iconCode: '1f336',
    parentSlug: 'vegetables',
  },
  {
    nameAr: 'باذنجان',
    nameEn: 'Eggplant',
    slug: 'eggplant',
    sortOrder: 4,
    iconCode: '1f46f',
    parentSlug: 'vegetables',
  },
  {
    nameAr: 'كوسا',
    nameEn: 'Zucchini',
    slug: 'zucchini',
    sortOrder: 5,
    iconCode: '1f952',
    parentSlug: 'vegetables',
  },
  {
    nameAr: 'بطاطس',
    nameEn: 'Potatoes',
    slug: 'potatoes',
    sortOrder: 6,
    iconCode: '1f954',
    parentSlug: 'vegetables',
  },
  {
    nameAr: 'جزر',
    nameEn: 'Carrots',
    slug: 'carrots',
    sortOrder: 7,
    iconCode: '1f955',
    parentSlug: 'vegetables',
  },
  {
    nameAr: 'بصل',
    nameEn: 'Onions',
    slug: 'onions',
    sortOrder: 8,
    iconCode: '1f9c5',
    parentSlug: 'vegetables',
  },
  {
    nameAr: 'ثوم',
    nameEn: 'Garlic',
    slug: 'garlic',
    sortOrder: 9,
    iconCode: '1f9c0',
    parentSlug: 'vegetables',
  },
  {
    nameAr: 'ملفوف',
    nameEn: 'Cabbage',
    slug: 'cabbage',
    sortOrder: 10,
    iconCode: '1f96c',
    parentSlug: 'vegetables',
  },
  {
    nameAr: 'قرنبيط',
    nameEn: 'Cauliflower',
    slug: 'cauliflower',
    sortOrder: 11,
    iconCode: '1f96c',
    parentSlug: 'vegetables',
  },
  {
    nameAr: 'بروكلي',
    nameEn: 'Broccoli',
    slug: 'broccoli',
    sortOrder: 12,
    iconCode: '1f966',
    parentSlug: 'vegetables',
  },
  {
    nameAr: 'سبانخ',
    nameEn: 'Spinach',
    slug: 'spinach',
    sortOrder: 13,
    iconCode: '1f96c',
    parentSlug: 'vegetables',
  },
  {
    nameAr: 'خس',
    nameEn: 'Lettuce',
    slug: 'lettuce',
    sortOrder: 14,
    iconCode: '1f96c',
    parentSlug: 'vegetables',
  },
  {
    nameAr: 'فاصوليا خضراء',
    nameEn: 'Green Beans',
    slug: 'green-beans',
    sortOrder: 15,
    iconCode: '1f953',
    parentSlug: 'vegetables',
  },
  {
    nameAr: 'بامية',
    nameEn: 'Okra',
    slug: 'okra',
    sortOrder: 16,
    iconCode: '1f954',
    parentSlug: 'vegetables',
  },
  {
    nameAr: 'ذرة',
    nameEn: 'Corn',
    slug: 'corn',
    sortOrder: 17,
    iconCode: '1f33d',
    parentSlug: 'vegetables',
  },

  // ── 2. Fruits ──────────────────────────────────────────────────────────────
  {
    nameAr: 'فواكه',
    nameEn: 'Fruits',
    slug: 'fruits',
    sortOrder: 2,
    iconCode: '1f34e', // 🍎
  },
  {
    nameAr: 'تفاح',
    nameEn: 'Apples',
    slug: 'apples',
    sortOrder: 1,
    iconCode: '1f34e',
    parentSlug: 'fruits',
  },
  {
    nameAr: 'موز',
    nameEn: 'Bananas',
    slug: 'bananas',
    sortOrder: 2,
    iconCode: '1f34c',
    parentSlug: 'fruits',
  },
  {
    nameAr: 'برتقال',
    nameEn: 'Oranges',
    slug: 'oranges',
    sortOrder: 3,
    iconCode: '1f34a',
    parentSlug: 'fruits',
  },
  {
    nameAr: 'ليمون',
    nameEn: 'Lemons',
    slug: 'lemons',
    sortOrder: 4,
    iconCode: '1f34b',
    parentSlug: 'fruits',
  },
  {
    nameAr: 'عنب',
    nameEn: 'Grapes',
    slug: 'grapes',
    sortOrder: 5,
    iconCode: '1f347',
    parentSlug: 'fruits',
  },
  {
    nameAr: 'بطيخ',
    nameEn: 'Watermelon',
    slug: 'watermelon',
    sortOrder: 6,
    iconCode: '1f349',
    parentSlug: 'fruits',
  },
  {
    nameAr: 'شمام',
    nameEn: 'Cantaloupe',
    slug: 'cantaloupe',
    sortOrder: 7,
    iconCode: '1f348',
    parentSlug: 'fruits',
  },
  {
    nameAr: 'مانجو',
    nameEn: 'Mangoes',
    slug: 'mangoes',
    sortOrder: 8,
    iconCode: '1f96d',
    parentSlug: 'fruits',
  },
  {
    nameAr: 'خوخ',
    nameEn: 'Peaches',
    slug: 'peaches',
    sortOrder: 9,
    iconCode: '1f351',
    parentSlug: 'fruits',
  },
  {
    nameAr: 'مشمش',
    nameEn: 'Apricots',
    slug: 'apricots',
    sortOrder: 10,
    iconCode: '1f347',
    parentSlug: 'fruits',
  },
  {
    nameAr: 'كمثرى',
    nameEn: 'Pears',
    slug: 'pears',
    sortOrder: 11,
    iconCode: '1f350',
    parentSlug: 'fruits',
  },
  {
    nameAr: 'فراولة',
    nameEn: 'Strawberries',
    slug: 'strawberries',
    sortOrder: 12,
    iconCode: '1f353',
    parentSlug: 'fruits',
  },
  {
    nameAr: 'رمان',
    nameEn: 'Pomegranate',
    slug: 'pomegranate',
    sortOrder: 13,
    iconCode: '1f4a3',
    parentSlug: 'fruits',
  },
  {
    nameAr: 'تين',
    nameEn: 'Figs',
    slug: 'figs',
    sortOrder: 14,
    iconCode: '1f95f',
    parentSlug: 'fruits',
  },
  {
    nameAr: 'زيتون',
    nameEn: 'Olives',
    slug: 'olives',
    sortOrder: 15,
    iconCode: '1f573',
    parentSlug: 'fruits',
  },
  {
    nameAr: 'أفوكادو',
    nameEn: 'Avocado',
    slug: 'avocado',
    sortOrder: 16,
    iconCode: '1f951',
    parentSlug: 'fruits',
  },

  // ── 3. Dates ───────────────────────────────────────────────────────────────
  {
    nameAr: 'تمور',
    nameEn: 'Dates',
    slug: 'dates',
    sortOrder: 3,
    iconCode: '1f4a3', // 🎃 (closest approximation)
  },
  {
    nameAr: 'تمر مجدول',
    nameEn: 'Medjool Dates',
    slug: 'medjool-dates',
    sortOrder: 1,
    iconCode: '1f4a3',
    parentSlug: 'dates',
  },
  {
    nameAr: 'تمر سكري',
    nameEn: 'Sukari Dates',
    slug: 'sukari-dates',
    sortOrder: 2,
    iconCode: '1f4a3',
    parentSlug: 'dates',
  },
  {
    nameAr: 'تمر برحي',
    nameEn: 'Barhi Dates',
    slug: 'barhi-dates',
    sortOrder: 3,
    iconCode: '1f4a3',
    parentSlug: 'dates',
  },
  {
    nameAr: 'تمر خلاص',
    nameEn: 'Khalas Dates',
    slug: 'khalas-dates',
    sortOrder: 4,
    iconCode: '1f4a3',
    parentSlug: 'dates',
  },
  {
    nameAr: 'تمر دجلة',
    nameEn: 'Deglet Nour Dates',
    slug: 'deglet-nour-dates',
    sortOrder: 5,
    iconCode: '1f4a3',
    parentSlug: 'dates',
  },
  {
    nameAr: 'تمر عجوة',
    nameEn: 'Ajwa Dates',
    slug: 'ajwa-dates',
    sortOrder: 6,
    iconCode: '1f4a3',
    parentSlug: 'dates',
  },
  {
    nameAr: 'تمر مجفف',
    nameEn: 'Dried Dates',
    slug: 'dried-dates',
    sortOrder: 7,
    iconCode: '1f4a3',
    parentSlug: 'dates',
  },

  // ── 4. Grains & Legumes ────────────────────────────────────────────────────
  {
    nameAr: 'حبوب وبقوليات',
    nameEn: 'Grains & Legumes',
    slug: 'grains-legumes',
    sortOrder: 4,
    iconCode: '1f33e', // 🌾
  },
  {
    nameAr: 'قمح',
    nameEn: 'Wheat',
    slug: 'wheat',
    sortOrder: 1,
    iconCode: '1f33e',
    parentSlug: 'grains-legumes',
  },
  {
    nameAr: 'شعير',
    nameEn: 'Barley',
    slug: 'barley',
    sortOrder: 2,
    iconCode: '1f33e',
    parentSlug: 'grains-legumes',
  },
  {
    nameAr: 'أرز',
    nameEn: 'Rice',
    slug: 'rice',
    sortOrder: 3,
    iconCode: '1f35a',
    parentSlug: 'grains-legumes',
  },
  {
    nameAr: 'ذرة بيضاء',
    nameEn: 'Sorghum',
    slug: 'sorghum',
    sortOrder: 4,
    iconCode: '1f33d',
    parentSlug: 'grains-legumes',
  },
  {
    nameAr: 'عدس',
    nameEn: 'Lentils',
    slug: 'lentils',
    sortOrder: 5,
    iconCode: '1f957',
    parentSlug: 'grains-legumes',
  },
  {
    nameAr: 'حمص',
    nameEn: 'Chickpeas',
    slug: 'chickpeas',
    sortOrder: 6,
    iconCode: '1f950',
    parentSlug: 'grains-legumes',
  },
  {
    nameAr: 'فول',
    nameEn: 'Fava Beans',
    slug: 'fava-beans',
    sortOrder: 7,
    iconCode: '1f954',
    parentSlug: 'grains-legumes',
  },
  {
    nameAr: 'فاصوليا',
    nameEn: 'White Beans',
    slug: 'white-beans',
    sortOrder: 8,
    iconCode: '1f950',
    parentSlug: 'grains-legumes',
  },
  {
    nameAr: 'لوبياء',
    nameEn: 'Black-eyed Peas',
    slug: 'black-eyed-peas',
    sortOrder: 9,
    iconCode: '1f950',
    parentSlug: 'grains-legumes',
  },
  {
    nameAr: 'بازلاء',
    nameEn: 'Peas',
    slug: 'peas',
    sortOrder: 10,
    iconCode: '1f95c',
    parentSlug: 'grains-legumes',
  },

  // ── 5. Herbs & Spices ──────────────────────────────────────────────────────
  {
    nameAr: 'أعشاب وتوابل',
    nameEn: 'Herbs & Spices',
    slug: 'herbs-spices',
    sortOrder: 5,
    iconCode: '1f32f', // 🌶
  },
  {
    nameAr: 'نعناع',
    nameEn: 'Mint',
    slug: 'mint',
    sortOrder: 1,
    iconCode: '1f32f',
    parentSlug: 'herbs-spices',
  },
  {
    nameAr: 'بقدونس',
    nameEn: 'Parsley',
    slug: 'parsley',
    sortOrder: 2,
    iconCode: '1f32f',
    parentSlug: 'herbs-spices',
  },
  {
    nameAr: 'كزبرة',
    nameEn: 'Coriander',
    slug: 'coriander',
    sortOrder: 3,
    iconCode: '1f32f',
    parentSlug: 'herbs-spices',
  },
  {
    nameAr: 'زعتر',
    nameEn: "Thyme (Za'atar)",
    slug: 'thyme-zaatar',
    sortOrder: 4,
    iconCode: '1f32f',
    parentSlug: 'herbs-spices',
  },
  {
    nameAr: 'ريحان',
    nameEn: 'Basil',
    slug: 'basil',
    sortOrder: 5,
    iconCode: '1f32f',
    parentSlug: 'herbs-spices',
  },
  {
    nameAr: 'شبت',
    nameEn: 'Dill',
    slug: 'dill',
    sortOrder: 6,
    iconCode: '1f32f',
    parentSlug: 'herbs-spices',
  },
  {
    nameAr: 'كمون',
    nameEn: 'Cumin',
    slug: 'cumin',
    sortOrder: 7,
    iconCode: '1f32f',
    parentSlug: 'herbs-spices',
  },
  {
    nameAr: 'كركم',
    nameEn: 'Turmeric',
    slug: 'turmeric',
    sortOrder: 8,
    iconCode: '1f32f',
    parentSlug: 'herbs-spices',
  },
  {
    nameAr: 'زنجبيل',
    nameEn: 'Ginger',
    slug: 'ginger',
    sortOrder: 9,
    iconCode: '1f4a8',
    parentSlug: 'herbs-spices',
  },
  {
    nameAr: 'فلفل أسود',
    nameEn: 'Black Pepper',
    slug: 'black-pepper',
    sortOrder: 10,
    iconCode: '1f32f',
    parentSlug: 'herbs-spices',
  },
  {
    nameAr: 'قرفة',
    nameEn: 'Cinnamon',
    slug: 'cinnamon',
    sortOrder: 11,
    iconCode: '1f32f',
    parentSlug: 'herbs-spices',
  },
  {
    nameAr: 'هيل',
    nameEn: 'Cardamom',
    slug: 'cardamom',
    sortOrder: 12,
    iconCode: '1f32f',
    parentSlug: 'herbs-spices',
  },
  {
    nameAr: 'زعفران',
    nameEn: 'Saffron',
    slug: 'saffron',
    sortOrder: 13,
    iconCode: '1f32f',
    parentSlug: 'herbs-spices',
  },
  {
    nameAr: 'بهارات مشكلة',
    nameEn: 'Mixed Spices',
    slug: 'mixed-spices',
    sortOrder: 14,
    iconCode: '1f32f',
    parentSlug: 'herbs-spices',
  },

  // ── 6. Honey & Bee Products ────────────────────────────────────────────────
  {
    nameAr: 'عسل ومنتجات النحل',
    nameEn: 'Honey & Bee Products',
    slug: 'honey-bee-products',
    sortOrder: 6,
    iconCode: '1f36f', // 🍯
  },
  {
    nameAr: 'عسل سدر',
    nameEn: 'Sidr Honey',
    slug: 'sidr-honey',
    sortOrder: 1,
    iconCode: '1f36f',
    parentSlug: 'honey-bee-products',
  },
  {
    nameAr: 'عسل أكاسيا',
    nameEn: 'Acacia Honey',
    slug: 'acacia-honey',
    sortOrder: 2,
    iconCode: '1f36f',
    parentSlug: 'honey-bee-products',
  },
  {
    nameAr: 'عسل مانوكا',
    nameEn: 'Manuka Honey',
    slug: 'manuka-honey',
    sortOrder: 3,
    iconCode: '1f36f',
    parentSlug: 'honey-bee-products',
  },
  {
    nameAr: 'عسل برية',
    nameEn: 'Wildflower Honey',
    slug: 'wildflower-honey',
    sortOrder: 4,
    iconCode: '1f36f',
    parentSlug: 'honey-bee-products',
  },
  {
    nameAr: 'عسل حبة البركة',
    nameEn: 'Black Seed Honey',
    slug: 'black-seed-honey',
    sortOrder: 5,
    iconCode: '1f36f',
    parentSlug: 'honey-bee-products',
  },
  {
    nameAr: 'شمع العسل',
    nameEn: 'Beeswax',
    slug: 'beeswax',
    sortOrder: 6,
    iconCode: '1f41d',
    parentSlug: 'honey-bee-products',
  },
  {
    nameAr: 'غذاء ملكي',
    nameEn: 'Royal Jelly',
    slug: 'royal-jelly',
    sortOrder: 7,
    iconCode: '1f36f',
    parentSlug: 'honey-bee-products',
  },
  {
    nameAr: 'حبوب اللقاح',
    nameEn: 'Bee Pollen',
    slug: 'bee-pollen',
    sortOrder: 8,
    iconCode: '1f41d',
    parentSlug: 'honey-bee-products',
  },

  // ── 7. Dairy & Eggs ────────────────────────────────────────────────────────
  {
    nameAr: 'ألبان وبيض',
    nameEn: 'Dairy & Eggs',
    slug: 'dairy-eggs',
    sortOrder: 7,
    iconCode: '1f9c0', // 🧀
  },
  {
    nameAr: 'حليب طازج',
    nameEn: 'Fresh Milk',
    slug: 'fresh-milk',
    sortOrder: 1,
    iconCode: '1f95b',
    parentSlug: 'dairy-eggs',
  },
  {
    nameAr: 'حليب ماعز',
    nameEn: 'Goat Milk',
    slug: 'goat-milk',
    sortOrder: 2,
    iconCode: '1f95b',
    parentSlug: 'dairy-eggs',
  },
  {
    nameAr: 'جبن',
    nameEn: 'Cheese',
    slug: 'cheese',
    sortOrder: 3,
    iconCode: '1f9c0',
    parentSlug: 'dairy-eggs',
  },
  {
    nameAr: 'لبن (زبادي)',
    nameEn: 'Yoghurt',
    slug: 'yoghurt',
    sortOrder: 4,
    iconCode: '1f95b',
    parentSlug: 'dairy-eggs',
  },
  {
    nameAr: 'قشطة',
    nameEn: 'Cream',
    slug: 'cream',
    sortOrder: 5,
    iconCode: '1f95b',
    parentSlug: 'dairy-eggs',
  },
  {
    nameAr: 'سمن بلدي',
    nameEn: 'Ghee (Clarified Butter)',
    slug: 'ghee',
    sortOrder: 6,
    iconCode: '1f9c0',
    parentSlug: 'dairy-eggs',
  },
  {
    nameAr: 'زبدة طازجة',
    nameEn: 'Fresh Butter',
    slug: 'fresh-butter',
    sortOrder: 7,
    iconCode: '1f9c0',
    parentSlug: 'dairy-eggs',
  },
  {
    nameAr: 'بيض دجاج بلدي',
    nameEn: 'Free-range Eggs',
    slug: 'free-range-eggs',
    sortOrder: 8,
    iconCode: '1f95a',
    parentSlug: 'dairy-eggs',
  },
  {
    nameAr: 'بيض نعام',
    nameEn: 'Ostrich Eggs',
    slug: 'ostrich-eggs',
    sortOrder: 9,
    iconCode: '1f95a',
    parentSlug: 'dairy-eggs',
  },

  // ── 8. Meat & Poultry ──────────────────────────────────────────────────────
  {
    nameAr: 'لحوم ودواجن',
    nameEn: 'Meat & Poultry',
    slug: 'meat-poultry',
    sortOrder: 8,
    iconCode: '1f356', // 🍖
  },
  {
    nameAr: 'لحم غنم',
    nameEn: 'Lamb',
    slug: 'lamb',
    sortOrder: 1,
    iconCode: '1f356',
    parentSlug: 'meat-poultry',
  },
  {
    nameAr: 'لحم بقر',
    nameEn: 'Beef',
    slug: 'beef',
    sortOrder: 2,
    iconCode: '1f356',
    parentSlug: 'meat-poultry',
  },
  {
    nameAr: 'لحم ماعز',
    nameEn: 'Goat Meat',
    slug: 'goat-meat',
    sortOrder: 3,
    iconCode: '1f356',
    parentSlug: 'meat-poultry',
  },
  {
    nameAr: 'دجاج بلدي',
    nameEn: 'Free-range Chicken',
    slug: 'free-range-chicken',
    sortOrder: 4,
    iconCode: '1f357',
    parentSlug: 'meat-poultry',
  },
  {
    nameAr: 'حمام',
    nameEn: 'Pigeon',
    slug: 'pigeon',
    sortOrder: 5,
    iconCode: '1f357',
    parentSlug: 'meat-poultry',
  },
  {
    nameAr: 'أرانب',
    nameEn: 'Rabbit',
    slug: 'rabbit',
    sortOrder: 6,
    iconCode: '1f357',
    parentSlug: 'meat-poultry',
  },
  {
    nameAr: 'إبل',
    nameEn: 'Camel Meat',
    slug: 'camel-meat',
    sortOrder: 7,
    iconCode: '1f42a',
    parentSlug: 'meat-poultry',
  },

  // ── 9. Nuts & Dried Fruits ─────────────────────────────────────────────────
  {
    nameAr: 'مكسرات وفواكه مجففة',
    nameEn: 'Nuts & Dried Fruits',
    slug: 'nuts-dried-fruits',
    sortOrder: 9,
    iconCode: '1f950', // 🥐
  },
  {
    nameAr: 'لوز',
    nameEn: 'Almonds',
    slug: 'almonds',
    sortOrder: 1,
    iconCode: '1f950',
    parentSlug: 'nuts-dried-fruits',
  },
  {
    nameAr: 'جوز',
    nameEn: 'Walnuts',
    slug: 'walnuts',
    sortOrder: 2,
    iconCode: '1f950',
    parentSlug: 'nuts-dried-fruits',
  },
  {
    nameAr: 'كاجو',
    nameEn: 'Cashews',
    slug: 'cashews',
    sortOrder: 3,
    iconCode: '1f950',
    parentSlug: 'nuts-dried-fruits',
  },
  {
    nameAr: 'فستق',
    nameEn: 'Pistachios',
    slug: 'pistachios',
    sortOrder: 4,
    iconCode: '1f950',
    parentSlug: 'nuts-dried-fruits',
  },
  {
    nameAr: 'بندق',
    nameEn: 'Hazelnuts',
    slug: 'hazelnuts',
    sortOrder: 5,
    iconCode: '1f950',
    parentSlug: 'nuts-dried-fruits',
  },
  {
    nameAr: 'فول سوداني',
    nameEn: 'Peanuts',
    slug: 'peanuts',
    sortOrder: 6,
    iconCode: '1f95e',
    parentSlug: 'nuts-dried-fruits',
  },
  {
    nameAr: 'زبيب',
    nameEn: 'Raisins',
    slug: 'raisins',
    sortOrder: 7,
    iconCode: '1f347',
    parentSlug: 'nuts-dried-fruits',
  },
  {
    nameAr: 'مشمش مجفف',
    nameEn: 'Dried Apricots',
    slug: 'dried-apricots',
    sortOrder: 8,
    iconCode: '1f351',
    parentSlug: 'nuts-dried-fruits',
  },
  {
    nameAr: 'تين مجفف',
    nameEn: 'Dried Figs',
    slug: 'dried-figs',
    sortOrder: 9,
    iconCode: '1f95f',
    parentSlug: 'nuts-dried-fruits',
  },
  {
    nameAr: 'توت مجفف',
    nameEn: 'Dried Mulberries',
    slug: 'dried-mulberries',
    sortOrder: 10,
    iconCode: '1f347',
    parentSlug: 'nuts-dried-fruits',
  },
  {
    nameAr: 'بذور (كتان/شيا/سمسم)',
    nameEn: 'Seeds (Flax/Chia/Sesame)',
    slug: 'seeds',
    sortOrder: 11,
    iconCode: '1f31f',
    parentSlug: 'nuts-dried-fruits',
  },

  // ── 10. Oils & Extracts ────────────────────────────────────────────────────
  {
    nameAr: 'زيوت ومستخلصات',
    nameEn: 'Oils & Extracts',
    slug: 'oils-extracts',
    sortOrder: 10,
    iconCode: '1f9eb', // 🧫 (closest)
  },
  {
    nameAr: 'زيت زيتون بكر',
    nameEn: 'Extra Virgin Olive Oil',
    slug: 'extra-virgin-olive-oil',
    sortOrder: 1,
    iconCode: '1f9eb',
    parentSlug: 'oils-extracts',
  },
  {
    nameAr: 'زيت حبة البركة',
    nameEn: 'Black Seed Oil',
    slug: 'black-seed-oil',
    sortOrder: 2,
    iconCode: '1f9eb',
    parentSlug: 'oils-extracts',
  },
  {
    nameAr: 'زيت السمسم',
    nameEn: 'Sesame Oil',
    slug: 'sesame-oil',
    sortOrder: 3,
    iconCode: '1f9eb',
    parentSlug: 'oils-extracts',
  },
  {
    nameAr: 'زيت جوز الهند',
    nameEn: 'Coconut Oil',
    slug: 'coconut-oil',
    sortOrder: 4,
    iconCode: '1f9eb',
    parentSlug: 'oils-extracts',
  },
  {
    nameAr: 'زيت الأرغان',
    nameEn: 'Argan Oil',
    slug: 'argan-oil',
    sortOrder: 5,
    iconCode: '1f9eb',
    parentSlug: 'oils-extracts',
  },
  {
    nameAr: 'خل تفاح',
    nameEn: 'Apple Cider Vinegar',
    slug: 'apple-cider-vinegar',
    sortOrder: 6,
    iconCode: '1f9b1',
    parentSlug: 'oils-extracts',
  },

  // ── 11. Seedlings & Plants ─────────────────────────────────────────────────
  {
    nameAr: 'شتلات ونباتات',
    nameEn: 'Seedlings & Plants',
    slug: 'seedlings-plants',
    sortOrder: 11,
    iconCode: '1f331', // 🌱
  },
  {
    nameAr: 'شتلات خضروات',
    nameEn: 'Vegetable Seedlings',
    slug: 'vegetable-seedlings',
    sortOrder: 1,
    iconCode: '1f331',
    parentSlug: 'seedlings-plants',
  },
  {
    nameAr: 'شتلات فاكهة',
    nameEn: 'Fruit Seedlings',
    slug: 'fruit-seedlings',
    sortOrder: 2,
    iconCode: '1f331',
    parentSlug: 'seedlings-plants',
  },
  {
    nameAr: 'أشجار نخيل',
    nameEn: 'Palm Trees',
    slug: 'palm-trees',
    sortOrder: 3,
    iconCode: '1f334',
    parentSlug: 'seedlings-plants',
  },
  {
    nameAr: 'نباتات عطرية',
    nameEn: 'Aromatic Plants',
    slug: 'aromatic-plants',
    sortOrder: 4,
    iconCode: '1f337',
    parentSlug: 'seedlings-plants',
  },
  {
    nameAr: 'بذور زراعية',
    nameEn: 'Agricultural Seeds',
    slug: 'agricultural-seeds',
    sortOrder: 5,
    iconCode: '1f31f',
    parentSlug: 'seedlings-plants',
  },

  // ── 12. Organic Products ───────────────────────────────────────────────────
  {
    nameAr: 'منتجات عضوية',
    nameEn: 'Organic Products',
    slug: 'organic',
    sortOrder: 12,
    iconCode: '1f40d', // 🐍 (natural/organic symbol)
  },
  {
    nameAr: 'خضروات عضوية',
    nameEn: 'Organic Vegetables',
    slug: 'organic-vegetables',
    sortOrder: 1,
    iconCode: '1f331',
    parentSlug: 'organic',
  },
  {
    nameAr: 'فواكه عضوية',
    nameEn: 'Organic Fruits',
    slug: 'organic-fruits',
    sortOrder: 2,
    iconCode: '1f34e',
    parentSlug: 'organic',
  },
  {
    nameAr: 'منتجات ألبان عضوية',
    nameEn: 'Organic Dairy',
    slug: 'organic-dairy',
    sortOrder: 3,
    iconCode: '1f9c0',
    parentSlug: 'organic',
  },
  {
    nameAr: 'حبوب عضوية',
    nameEn: 'Organic Grains',
    slug: 'organic-grains',
    sortOrder: 4,
    iconCode: '1f33e',
    parentSlug: 'organic',
  },
];

// ─── Seeder ───────────────────────────────────────────────────────────────────

export async function seedCategories(dataSource: DataSource): Promise<void> {
  const repo = dataSource.getRepository(Category);

  // ── Idempotent check ───────────────────────────────────────────────────────
  const existing = await repo.count();
  if (existing > 0) {
    console.log(`⏭  Categories already seeded (${existing} rows). Skipping.`);
    return;
  }

  console.log('🌱 Seeding categories…');

  // ── Pass 1: Insert parent categories ───────────────────────────────────────
  const parents = SEED_DATA.filter((r) => !r.parentSlug);

  const parentEntities = repo.create(
    parents.map((p) => ({
      nameAr: p.nameAr,
      nameEn: p.nameEn,
      slug: p.slug,
      sortOrder: p.sortOrder,
      isActive: true,
      parentId: null,
      iconUrl: icon(p.iconCode), // Generate Twemoji URL
      iconPublicId: null, // Twemoji is free/public, no need to track
    })),
  );

  const savedParents = await repo.save(parentEntities);

  // Build slug → id map for child lookups
  const slugToId = new Map<string, string>(
    savedParents.map((p) => [p.slug, p.id]),
  );

  console.log(`  ✅ Inserted ${savedParents.length} parent categories`);

  // ── Pass 2: Insert sub-categories ─────────────────────────────────────────
  const children = SEED_DATA.filter((r) => !!r.parentSlug);

  const childEntities = repo.create(
    children.map((c) => {
      const parentId = slugToId.get(c.parentSlug!);
      if (!parentId) {
        throw new Error(
          `Seed error: parentSlug "${c.parentSlug}" not found for child "${c.slug}"`,
        );
      }
      return {
        nameAr: c.nameAr,
        nameEn: c.nameEn,
        slug: c.slug,
        sortOrder: c.sortOrder,
        isActive: true,
        parentId,
        iconUrl: icon(c.iconCode),
        iconPublicId: null,
      };
    }),
  );

  const savedChildren = await repo.save(childEntities);
  console.log(`  ✅ Inserted ${savedChildren.length} sub-categories`);

  const total = savedParents.length + savedChildren.length;
  console.log(
    `\n🎉 Done — ${total} categories seeded across ${savedParents.length} sections.\n`,
  );
}

// ─── Standalone runner ────────────────────────────────────────────────────────

async function run() {
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }

  try {
    await seedCategories(AppDataSource);
  } finally {
    await AppDataSource.destroy();
  }
}

if (require.main === module) {
  run().catch((err) => {
    console.error('❌ Seeder failed:', err);
    process.exit(1);
  });
}
