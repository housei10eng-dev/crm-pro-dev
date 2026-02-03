export * from './types';
export * from './client';
export * from './auth';
export * from './admin';
export * from './tenant';

// Storage exports - import separately to avoid bundling issues
export * from './storage/web';
// For mobile: import { mobileStorage } from '@crm/api/storage/mobile';
