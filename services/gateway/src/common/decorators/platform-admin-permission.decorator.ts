import { SetMetadata } from '@nestjs/common';

export const PLATFORM_ADMIN_ACCESS_METADATA = 'platform_admin_access';

export type PlatformAdminAccessMetadata =
  | { kind: 'global' }
  | { kind: 'app-any' }
  | { kind: 'app-super' }
  | { kind: 'app-permission'; permissions: string[] };

export const RequirePlatformAdminGlobal = () => SetMetadata(PLATFORM_ADMIN_ACCESS_METADATA, { kind: 'global' } satisfies PlatformAdminAccessMetadata);

export const RequireAppAdmin = () => SetMetadata(PLATFORM_ADMIN_ACCESS_METADATA, { kind: 'app-any' } satisfies PlatformAdminAccessMetadata);

export const RequireAppSuperAdmin = () => SetMetadata(PLATFORM_ADMIN_ACCESS_METADATA, { kind: 'app-super' } satisfies PlatformAdminAccessMetadata);

export const RequireAppPermission = (...permissions: string[]) =>
  SetMetadata(PLATFORM_ADMIN_ACCESS_METADATA, { kind: 'app-permission', permissions } satisfies PlatformAdminAccessMetadata);
