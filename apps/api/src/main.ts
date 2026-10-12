import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { SwaggerModule, DocumentBuilder, type OpenAPIObject } from '@nestjs/swagger';
import { generateZodOpenApiDocument } from '@innkeeper/contracts/openapi';
import { AppModule } from './app.module.js';
import { ProblemFilter } from './kernel/errors/problem-filter.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    cors: {
      origin: true,
      credentials: true,
    },
  });

  // Parse cookies so auth reads the rotating refresh token + CSRF double-submit
  // token from inbound requests.
  app.use(cookieParser());

  // Global RFC 7807 Problem Details filter
  app.useGlobalFilters(new ProblemFilter());

  // OpenAPI 3.1 Documentation: controller-derived paths + schemas generated
  // directly from the Zod contracts in @innkeeper/contracts.
  const config = new DocumentBuilder()
    .setTitle('Innkeeper API')
    .setDescription(
      'Multi-tenant, multi-branch hotel & property management REST API and realtime engine.',
    )
    .setVersion('1.0.0')
    .addTag('Innkeeper')
    .addApiKey({ type: 'apiKey', name: 'X-Branch-Id', in: 'header' }, 'X-Branch-Id')
    .addApiKey({ type: 'apiKey', name: 'Idempotency-Key', in: 'header' }, 'Idempotency-Key')
    .build();

  const controllerDocument = SwaggerModule.createDocument(app, config);
  let document: OpenAPIObject = controllerDocument;

  try {
    const { document: zodDocument, registered, skipped } = generateZodOpenApiDocument();
    const zodSchemas = (
      zodDocument.components as unknown as { schemas?: Record<string, unknown> } | undefined
    )?.schemas;
    const controllerSchemas = (
      controllerDocument.components as unknown as { schemas?: Record<string, unknown> } | undefined
    )?.schemas;
    document = {
      ...controllerDocument,
      openapi: '3.1.0',
      components: {
        ...controllerDocument.components,
        schemas: {
          ...(controllerSchemas ?? {}),
          ...(zodSchemas ?? {}),
        },
      },
    } as unknown as OpenAPIObject;
    console.log(
      `[Innkeeper API] OpenAPI 3.1 generated from Zod contracts: ${registered.length} component schemas (${skipped.length} skipped).`,
    );
  } catch (err) {
    console.warn(
      '[Innkeeper API] Zod OpenAPI generation failed; serving controller-derived document.',
      err,
    );
  }

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
