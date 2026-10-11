import { HttpException, HttpStatus } from '@nestjs/common';

export interface InvalidParam {
  name: string;
  reason: string;
}

export class ProblemDetailsException extends HttpException {
  public readonly code: string;
  public readonly detailMsg?: string;
  public readonly invalidParams?: InvalidParam[];

  constructor(
    code: string,
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
    detail?: string,
    invalidParams?: InvalidParam[]
  ) {
    super(
      {
        code,
        message,
        detail,
        invalidParams,
      },
      status
    );
    this.code = code;
    this.detailMsg = detail;
    this.invalidParams = invalidParams;
  }
}
