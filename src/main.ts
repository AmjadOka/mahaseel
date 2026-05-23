import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import multipart from '@fastify/multipart';

import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

async function bootstrap() {
  const fastifyAdapter = new FastifyAdapter({
    logger: process.env.NODE_ENV === 'development',
  });

  // ── Stripe webhook: capture raw buffer before Fastify parses the body ────
  //
  // Fastify parses JSON before route handlers run. We hook into preParsing to
  // grab the raw bytes on the webhook route so Stripe can verify its signature.
  fastifyAdapter
    .getInstance()
    .addHook(
      'preParsing',
      (request: any, _reply: any, payload: any, done: any) => {
        if (request.url?.includes('/payments/webhook')) {
          const chunks: Buffer[] = [];
          payload.on('data', (chunk: Buffer) => chunks.push(chunk));
          payload.on('end', () => {
            request.rawBody = Buffer.concat(chunks);
          });
        }
        done(null, payload);
      },
    );

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    fastifyAdapter,
  );

  const config = app.get(ConfigService);

  const port = config.get<number>('app.port', 3000);
  const prefix = config.get<string>('app.prefix', 'api/v1');

  // Multipart
  await app.register(multipart, {
    limits: {
      fileSize: 100 * 1024 * 1024,
      files: 10,
    },
  });

  // Global prefix
  app.setGlobalPrefix(prefix);

  // Versioning
  app.enableVersioning({
    type: VersioningType.URI,
  });

  // CORS
  app.enableCors({
    origin: config.get('app.frontendUrl', '*'),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  });

  // Pipes
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Filters & Interceptors
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(
    new LoggingInterceptor(),
    new TransformInterceptor(),
  );

  /**
   * =========================
   * Swagger (DEV ONLY)
   * =========================
   */
  if (config.get('app.env') !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Mahaseel API')
      .setDescription(
        'Agricultural marketplace — merchants, farms, products, auctions',
      )
      .setVersion('1.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
        'access-token',
      )
      .addTag('auth')
      .addTag('users')
      .addTag('farms')
      .addTag('products')
      .addTag('orders')
      .addTag('wallet')
      .addTag('notifications')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);

    SwaggerModule.setup('docs', app, document, {
      jsonDocumentUrl: 'docs-json',
      swaggerOptions: {
        persistAuthorization: true,
      },
    });
  }

  await app.listen(port, '0.0.0.0');

  console.log(`🌾 API running on http://localhost:${port}`);
  console.log(`📘 Swagger UI: http://localhost:${port}/${prefix}/docs`);
  console.log(`📄 Swagger JSON: http://localhost:${port}/${prefix}/docs-json`);
}

bootstrap();
