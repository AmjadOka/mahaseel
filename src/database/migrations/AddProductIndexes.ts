import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductIndexes1710000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX idx_products_status_deleted
      ON products(status, is_deleted);
    `);

    await queryRunner.query(`
      CREATE INDEX idx_products_category
      ON products(category_id);
    `);

    await queryRunner.query(`
      CREATE INDEX idx_products_sale_method
      ON products(sale_method);
    `);

    await queryRunner.query(`
      CREATE INDEX idx_farms_location_text
      ON farms(location_text);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_products_status_deleted;
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_products_category;
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_products_sale_method;
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_farms_location_text;
    `);
  }
}
