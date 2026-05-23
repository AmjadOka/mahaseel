import { registerAs } from '@nestjs/config';
import { DataSource, DataSourceOptions } from 'typeorm';
import * as dotenv from 'dotenv';
dotenv.config();

const options: DataSourceOptions = {
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT ?? '3000', 10),
  username: process.env.DB_USERNAME || 'mahaseel',
  password: process.env.DB_PASSWORD || 'secret',
  database: process.env.DB_NAME || 'mahaseel_db',
  synchronize: process.env.DB_SYNC === 'true',
  logging: process.env.DB_LOGGING === 'true',
  entities: [__dirname + '/../**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/../database/migrations/**{.ts,.js}'],
  migrationsTableName: 'typeorm_migrations',
};

export default registerAs('database', () => ({
  host: options.host,
  port: options.port,
  username: options.username,
  password: options.password,
  name: options.database,
  sync: options.synchronize,
  logging: options.logging,
}));

export const AppDataSource = new DataSource(options);
