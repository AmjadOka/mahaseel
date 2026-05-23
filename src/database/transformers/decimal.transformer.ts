export class DecimalTransformer {
  to(value?: number): number | null {
    return value ?? null;
  }

  from(value?: string): number | null {
    return value ? Number(value) : null;
  }
}
