import { Role } from 'src/common/enums/role.enum';

export interface JwtPayload {
  sub: string;
  phone: string;
  type: 'access' | 'refresh';
  role: Role;
  email: string;

  tokenVersion: number;
  jti: string;

  iat?: number;
  exp?: number;
}
