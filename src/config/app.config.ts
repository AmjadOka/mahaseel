import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  env: process.env.NODE_ENV ?? 'development',

  port: parseInt(process.env.PORT ?? '3000', 10),

  prefix: process.env.API_PREFIX ?? 'api/v1',

  frontendUrl: process.env.FRONTEND_URL ?? '*',

  throttleTtl: parseInt(process.env.THROTTLE_TTL ?? '60', 10),

  throttleLimit: parseInt(process.env.THROTTLE_LIMIT ?? '100', 10),

  platformFeePercent: parseFloat(process.env.PLATFORM_FEE_PERCENT ?? '5'),

  walletHoldDays: parseInt(process.env.WALLET_HOLD_DAYS ?? '3', 10),

  adminSecret: process.env.ADMIN_SECRET ?? 'admin-secret',

  otpExpirySeconds: parseInt(process.env.OTP_EXPIRY_SECONDS ?? '300', 10),

  otpLength: parseInt(process.env.OTP_LENGTH ?? '6', 10),

  otpMock: process.env.OTP_MOCK === 'true',
}));
