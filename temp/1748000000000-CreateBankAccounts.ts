import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableIndex,
  TableForeignKey,
} from 'typeorm';

export class CreateBankAccounts1748000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    /* ── 1. Create bank_accounts table ───────────────── */
    await queryRunner.createTable(
      new Table({
        name: 'bank_accounts',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'user_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'bank_name',
            type: 'varchar',
            length: '100',
          },
          {
            name: 'account_holder_name',
            type: 'varchar',
            length: '150',
          },
          {
            name: 'account_number',
            type: 'varchar',
            length: '50',
          },
          {
            name: 'iban',
            type: 'varchar',
            length: '34',
            isNullable: true,
          },
          {
            name: 'branch_name',
            type: 'varchar',
            length: '150',
            isNullable: true,
          },
          {
            name: 'is_default',
            type: 'boolean',
            default: false,
          },
          {
            name: 'is_active',
            type: 'boolean',
            default: true,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'now()',
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'now()',
          },
        ],
      }),
      true, // ifNotExists
    );

    /* ── 2. Index: user_id + is_default ─────────────── */
    await queryRunner.createIndex(
      'bank_accounts',
      new TableIndex({
        name: 'IDX_bank_accounts_user_default',
        columnNames: ['user_id', 'is_default'],
      }),
    );

    /* ── 3. FK: bank_accounts.user_id → users.id ─────── */
    await queryRunner.createForeignKey(
      'bank_accounts',
      new TableForeignKey({
        name: 'FK_bank_accounts_user',
        columnNames: ['user_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    /* ── 4. Patch withdrawals: add bank_account_id ───── */
    await queryRunner.addColumn('withdrawals', {
      name: 'bank_account_id',
      type: 'uuid',
      isNullable: true,
    } as any);

    await queryRunner.createForeignKey(
      'withdrawals',
      new TableForeignKey({
        name: 'FK_withdrawals_bank_account',
        columnNames: ['bank_account_id'],
        referencedTableName: 'bank_accounts',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    /* reverse order */
    await queryRunner.dropForeignKey(
      'withdrawals',
      'FK_withdrawals_bank_account',
    );
    await queryRunner.dropColumn('withdrawals', 'bank_account_id');
    await queryRunner.dropForeignKey('bank_accounts', 'FK_bank_accounts_user');
    await queryRunner.dropIndex(
      'bank_accounts',
      'IDX_bank_accounts_user_default',
    );
    await queryRunner.dropTable('bank_accounts');
  }
}
