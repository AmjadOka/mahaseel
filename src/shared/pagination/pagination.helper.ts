import { ObjectLiteral, SelectQueryBuilder } from 'typeorm';

export async function paginate<T>(
  qb: SelectQueryBuilder<
    T extends ObjectLiteral ? Record<string, unknown> : ObjectLiteral
  >,
  page: number,
  limit: number,
) {
  const total = await qb.getCount();
  const items = await qb
    .skip((page - 1) * limit)
    .take(limit)
    .getMany();
  console.log(limit, 'limit');
  const totalPages = Math.ceil(total / limit);

  return {
    items,
    meta: {
      total,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  };
}
