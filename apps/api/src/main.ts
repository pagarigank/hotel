import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { ProblemFilter } from './kernel/errors/problem-filter.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    cors: {
      origin: true,
      credentials: true,
    },
  });

  // Global RFC 7807 Problem Details filter
  app.useGlobalFilters(new ProblemFilter());

  // OpenAPI 3.1 Documentation Setup
  const config = new DocumentBuilder()
    .setTitle('Innkeeper API')
    .setDescription(
      'Multi-tenant, multi-branch hotel & property management REST API and realtime engine.'
    )
    .setVersion('1.0.0')
    .addTag('Innkeeper')
    .addApiKey({ type: 'apiKey', name: 'X-Branch-Id', in: 'header' }, 'X-Branch-Id')
    .addApiKey({ type: 'apiKey', name: 'Idempotency-Key', in: 'header' }, 'Idempotency-Key')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`[Innkeeper API] Server listening on http://localhost:${port}`);
  console.log(`[Innkeeper API] OpenAPI Swagger docs on http://localhost:${port}/api/docs`);
}

bootstrap().catch((err) => {
  console.error('[Innkeeper API] Fatal bootstrap error:', err);
  process.exit(1);
});
