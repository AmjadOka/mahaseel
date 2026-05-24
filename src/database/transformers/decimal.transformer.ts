import { ValueTransformer } from 'typeorm';

export class DecimalTransformer implements ValueTransformer {
  // DB → JS: converts string from Postgres to a JS number
  from(value: string | null): number | null {
    return value !== null && value !== undefined ? parseFloat(value) : null;
  }

  // JS → DB: never let null/undefined sneak through
  to(value: number | null | undefined): number {
    return value ?? 0;
  }
}
