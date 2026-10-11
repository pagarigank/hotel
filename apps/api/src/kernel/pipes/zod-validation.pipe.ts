import { PipeTransform, Injectable, HttpStatus } from '@nestjs/common';
import { ZodSchema, ZodError } from 'zod';
import { ProblemDetailsException } from '../errors/problem-details.exception.js';

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private schema: ZodSchema) {}

  transform(value: unknown) {
    try {
      return this.schema.parse(value);
    } catch (error) {
      if (error instanceof ZodError) {
        const invalidParams = error.errors.map((e) => ({
          name: e.path.join('.'),
          reason: e.message,
        }));
        throw new ProblemDetailsException(
          'VALIDATION_FAILED',
          'Request validation failed',
          HttpStatus.UNPROCESSABLE_ENTITY,
          'One or more parameters did not satisfy the validation schema',
          invalidParams
        );
      }
      throw error;
    }
  }
}
