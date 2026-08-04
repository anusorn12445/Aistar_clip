import { SetMetadata } from '@nestjs/common';

export const PERMISSION_KEY = 'required_permission';

// actions ตาม Permission Matrix §C: V, C, A, P, E, X
export const RequirePermission = (module: string, action: string) =>
  SetMetadata(PERMISSION_KEY, { module, action });
