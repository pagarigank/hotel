import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response, Request } from 'express';
import { ProblemDetailsException } from './problem-details.exception.js';
import { RequestContext } from '../context/request-context.js';

@Catch()
export class ProblemFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const correlationId =
      RequestContext.current()?.correlationId ||
      (request.headers['x-correlation-id'] as string) ||
      'n/a';

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_SERVER_ERROR';
    let title = 'Internal Server Error';
    let detail = 'An unexpected server error occurred.';
    let invalidParams: unknown = undefined;

    if (exception instanceof ProblemDetailsException) {
      status = exception.getStatus();
      code = exception.code;
      title = exception.message;
      detail = exception.detailMsg || exception.message;
      invalidParams = exception.invalidParams;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      title = exception.message;
      code = HttpStatus[status] || 'HTTP_ERROR';
      const res = exception.getResponse();
      detail = typeof res === 'object' && res !== null && 'message' in res ? String((res as any).message) : exception.message;
    } else if (exception instanceof Error) {
      detail = exception.message;
      // Handle PostgreSQL RLS violation specifically
      if ((exception as any).code === '42501') {
        status = HttpStatus.FORBIDDEN;
        code = 'RLS_SECURITY_VIOLATION';
        title = 'Row-Level Security Violation';
        detail = 'Action rejected by tenant boundary security policy.';
      }
    }

    const problemResponse = {
      type: 'about:blank',
      title,
      status,
      detail,
      instance: request.url,
      code,
      correlationId,
      ...(invalidParams ? { invalidParams } : {}),
    };

    response
      .status(status)
      .contentType('application/problem+json')
      .json(problemResponse);
  }
}
