import { z } from 'zod';
import {
  extendZodWithOpenApi,
  OpenAPIRegistry,
  OpenApiGeneratorV31,
} from '@asteasolutions/zod-to-openapi';
import * as contracts from './index.js';

// Teach Zod the `.openapi()` decorator method used by the generator.
extendZodWithOpenApi(z);

/**
 * Duck-typed Zod detection: robust even if a transitive workspace package
 * resolves a differently-instantiated copy of the Zod runtime.
 */
function isZodSchema(value: unknown): value is z.ZodTypeAny {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { parse?: unknown }).parse === 'function' &&
    typeof (value as { safeParse?: unknown }).safeParse === 'function' &&
    '_def' in (value as Record<string, unknown>)
  );
}

export interface ZodOpenApiResult {
  document: ReturnType<OpenApiGeneratorV31['generateDocument']>;
  registered: string[];
  skipped: string[];
}

/**
 * Every exported Zod schema in the contracts package, keyed by its export name.
 * Adding a new `*Schema` export makes it appear in the OpenAPI document automatically.
 */
export function listZodContractSchemas(): ReadonlyArray<readonly [string, z.ZodTypeAny]> {
  return (Object.entries(contracts) as Array<[string, unknown]>)
    .filter(([, value]) => isZodSchema(value))
    .map(([name, value]) => [name, value as z.ZodTypeAny]);
}

/**
 * Produces an OpenAPI **3.1** document whose component schemas are generated
 * directly from the Zod contracts (no hand-maintained DTO decorators).
 *
 * Schemas are converted one at a time so exotic-but-valid Zod constructs that
 * the converter cannot express (e.g. free-form `z.any()`/`z.unknown()` fields)
 * are skipped without silently degrading the rest of the document.
 */
export function generateZodOpenApiDocument(): ZodOpenApiResult {
  const registered: string[] = [];
  const skipped: string[] = [];
  const schemas: Record<string, unknown> = {};

  for (const [name, schema] of listZodContractSchemas()) {
    const registry = new OpenAPIRegistry();
    registry.register(name, schema);
    try {
      const generator = new OpenApiGeneratorV31([...registry.definitions]);
      const single = generator.generateDocument({
        openapi: '3.1.0',
        info: { title: 'Innkeeper API', version: '1.0.0' },
      });
      const component = single.components?.schemas?.[name];
      if (component === undefined) {
        skipped.push(name);
        continue;
      }
      schemas[name] = component;
      registered.push(name);
    } catch {
      skipped.push(name);
    }
  }

  const document = {
    openapi: '3.1.0',
    info: {
      title: 'Innkeeper API',
      version: '1.0.0',
      description:
        'Multi-tenant, multi-branch hotel & property management REST API. Schemas generated from Zod contracts.',
    },
    paths: {},
    components: { schemas },
  } as ReturnType<OpenApiGeneratorV31['generateDocument']>;

  return { document, registered, skipped };
}
