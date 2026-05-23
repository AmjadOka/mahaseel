import { AppDataSource } from '../../config/database.config';
import { User } from '../../modules/users/entities/user.entity';
import { Role } from 'src/common/enums/role.enum';

async function seed() {
  await AppDataSource.initialize();
  const repo = AppDataSource.getRepository(User);

  const existing = await repo.findOne({ where: { phone: '+970000000000' } });
  if (existing) {
    console.log('Admin already exists');
    await AppDataSource.destroy();
    return;
  }

  const admin = repo.create({
    phone: '+970000000000',
    fullName: 'Mahaseel Admin',
    role: Role.ADMIN,
    isActive: true,
  });

  await repo.save(admin);
  console.log('✅ Admin user created: +970000000000');
  await AppDataSource.destroy();
}

seed().catch(console.error);
