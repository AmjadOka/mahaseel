import { Role } from '../enums/role.enum';

export interface PaginatedResponse<T> {
  items: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

export interface AuthUser {
  sub: string;
  role: Role;
  email: string;
  phone: string;
}
