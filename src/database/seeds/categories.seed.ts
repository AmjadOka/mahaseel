import { AppDataSource } from '../../config/database.config';
import { Category } from '../../modules/categories/entities/category.entity';

const categories = [
  {
    nameAr: 'خضروات',
    nameEn: 'Vegetables',
    slug: 'vegetables',
    children: [
      'خيار',
      'طماطم',
      'فلفل',
      'بطاطس',
      'بصل',
      'ثوم',
      'كوسا',
      'باذنجان',
    ],
  },
  {
    nameAr: 'فواكه',
    nameEn: 'Fruits',
    slug: 'fruits',
    children: ['بطيخ', 'شمام', 'رمان', 'عنب', 'تمر', 'موز', 'تفاح', 'برتقال'],
  },
  {
    nameAr: 'حبوب وبقوليات',
    nameEn: 'Grains & Legumes',
    slug: 'grains',
    children: ['قمح', 'شعير', 'ذرة', 'عدس', 'حمص', 'فول'],
  },
  {
    nameAr: 'حيوانات',
    nameEn: 'Livestock',
    slug: 'livestock',
    children: ['أبقار', 'أغنام', 'ماعز', 'إبل', 'دواجن'],
  },
  {
    nameAr: 'منتجات الألبان',
    nameEn: 'Dairy',
    slug: 'dairy',
    children: ['حليب', 'جبن', 'زبدة', 'لبن'],
  },
  {
    nameAr: 'أعشاب وتوابل',
    nameEn: 'Herbs & Spices',
    slug: 'herbs',
    children: ['نعناع', 'كزبرة', 'بقدونس', 'زعتر', 'كمون'],
  },
];

async function seed() {
  await AppDataSource.initialize();
  const repo = AppDataSource.getRepository(Category);

  for (let i = 0; i < categories.length; i++) {
    const cat = categories[i];
    const parent = repo.create({
      nameAr: cat.nameAr,
      nameEn: cat.nameEn,
      slug: cat.slug,
      sortOrder: i,
      isActive: true,
    });
    const savedParent = await repo.save(parent);

    for (let j = 0; j < cat.children.length; j++) {
      await repo.save(
        repo.create({
          nameAr: cat.children[j],
          slug: `${cat.slug}-${j}`,
          parentId: savedParent.id,
          sortOrder: j,
          isActive: true,
        }),
      );
    }
    console.log(`✅ ${cat.nameAr} + ${cat.children.length} sub-categories`);
  }

  await AppDataSource.destroy();
  console.log('🌾 Done');
}

seed().catch(console.error);
