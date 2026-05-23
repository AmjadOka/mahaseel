/**
 * Run with: npm run seed
 * Runs all seeds in order
 */
import { execSync } from 'child_process';

const seeds = [
  'src/database/seeds/categories.seed.ts',
  'src/database/seeds/admin.seed.ts',
];

for (const seed of seeds) {
  console.log(`\n▶ Running: ${seed}`);
  execSync(`npx ts-node -r tsconfig-paths/register ${seed}`, {
    stdio: 'inherit',
  });
}

console.log('\n✅ All seeds completed');
