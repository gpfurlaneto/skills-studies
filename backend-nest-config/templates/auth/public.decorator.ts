import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Marks a route as open. Only meaningful if the guard is registered globally. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
