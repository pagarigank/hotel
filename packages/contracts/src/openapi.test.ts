import { describe, it, expect } from 'vitest';
import { generateZodOpenApiDocument } from './openapi.js';

describe('OpenAPI 3.1 generation from Zod contracts', () => {
  it('emits an OpenAPI 3.1 document', () => {
    const { document } = generateZodOpenApiDocument();
    expect(document.openapi).toBe('3.1.0');
    expect(document.info.title).toBe('Innkeeper API');
  });

  it('registers Zod schemas as named OpenAPI components', () => {
    const { document, registered } = generateZodOpenApiDocument();
    const schemas = Object.keys(document.components?.schemas ?? {});

    expect(registered.length).toBeGreaterThan(50);
    expect(schemas.length).toBeGreaterThan(50);

    // A representative core contract must be present.
    expect(schemas).toContain('ReservationDtoSchema');
    expect(schemas).toContain('ProblemErrorSchema');
  });
});
