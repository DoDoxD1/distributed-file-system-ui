import { HttpErrorResponse } from '@angular/common/http';

import { ErrorResponse } from '../models/api.models';

const isErrorResponse = (value: unknown): value is ErrorResponse => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  return 'message' in value && typeof value.message === 'string';
};

export const getErrorMessage = (error: unknown, fallback = 'Something went wrong.'): string => {
  if (error instanceof HttpErrorResponse) {
    if (typeof error.error === 'string' && error.error.trim().length > 0) {
      return error.error;
    }

    if (isErrorResponse(error.error)) {
      return error.error.message;
    }

    if (error.message) {
      return error.message;
    }
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
};
