import { HttpContext, HttpContextToken } from '@angular/common/http';

export const SKIP_AUTH = new HttpContextToken<boolean>(() => false);
export const SKIP_REFRESH = new HttpContextToken<boolean>(() => false);
export const HAS_RETRIED = new HttpContextToken<boolean>(() => false);

export const createPublicAuthContext = (): HttpContext =>
  new HttpContext().set(SKIP_AUTH, true).set(SKIP_REFRESH, true);
