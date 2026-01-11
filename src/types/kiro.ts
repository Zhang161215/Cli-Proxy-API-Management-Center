export type KiroAuthMethod = 'social' | 'builder-id' | 'idc';

export type KiroProvider = 'Google' | 'Github' | 'BuilderId' | 'Enterprise';

export type KiroAccountStatus = 'active' | 'banned' | 'expired' | 'unknown';

export type KiroSubscriptionType = 'FREE' | 'PRO' | 'PRO_PLUS' | 'ENTERPRISE';

export interface KiroUsageBreakdown {
  currentUsage: number;
  usageLimit: number;
  nextDateReset?: number;
  overageRate?: number;
  freeTrialInfo?: {
    currentUsage: number;
    usageLimit: number;
  };
  bonuses?: Array<{
    displayName: string;
    currentUsage: number;
    usageLimit: number;
  }>;
}

export interface KiroSubscriptionInfo {
  type: string;
  subscriptionTitle: string;
  overageCapability?: 'OVERAGE_CAPABLE' | 'NOT_OVERAGE_CAPABLE';
  upgradeCapability?: 'UPGRADE_CAPABLE' | 'NOT_UPGRADE_CAPABLE';
}

export interface KiroUserInfo {
  email?: string;
  userId?: string;
}

export interface KiroOverageConfiguration {
  overageStatus: 'ENABLED' | 'DISABLED';
}

export interface KiroUsageData {
  usageBreakdownList?: KiroUsageBreakdown[];
  usageBreakdown?: KiroUsageBreakdown;
  subscriptionInfo?: KiroSubscriptionInfo;
  userInfo?: KiroUserInfo;
  overageConfiguration?: KiroOverageConfiguration;
  daysUntilReset?: number;
  nextDateReset?: number;
}

export interface KiroAccountItem {
  id: string;
  email: string;
  label?: string;
  provider: KiroProvider | string;
  authMethod: KiroAuthMethod | string;
  status: KiroAccountStatus | string;
  accessToken?: string;
  refreshToken?: string;
  profileArn?: string;
  expiresAt?: string;
  clientId?: string;
  clientSecret?: string;
  clientIdHash?: string;
  region?: string;
  startUrl?: string;
  usageData?: KiroUsageData;
  createdAt?: string;
  updatedAt?: string;
  lastRefreshedAt?: string;
  fileName?: string;
  filePath?: string;
}

export interface KiroAccountStats {
  total: number;
  active: number;
  banned: number;
  expired: number;
  proPlus: number;
  pro: number;
  free: number;
  totalQuota: number;
  totalUsed: number;
  usagePercent: number;
  remaining: number;
}

export interface KiroOAuthStartResponse {
  status?: string;
  state?: string;
  method?: string;
  url?: string;
  userCode?: string;
  deviceCode?: string;
  verificationUri?: string;
  expiresIn?: number;
}

export interface KiroOAuthStatusResponse {
  status: 'ok' | 'wait' | 'error' | 'expired' | 'device_code' | 'auth_url';
  error?: string;
  verification_url?: string;
  user_code?: string;
  auth_url?: string;
  url?: string;
}

export interface KiroRefreshResponse {
  success: boolean;
  account?: KiroAccountItem;
  error?: string;
}

export interface KiroImportResponse {
  success: boolean;
  savedPath?: string;
  email?: string;
  provider?: string;
  error?: string;
}

export interface KiroOAuthProvider {
  id: 'kiro-google' | 'kiro-github' | 'kiro-aws' | 'kiro-import';
  name: string;
  titleKey: string;
  hintKey: string;
  icon: string | { light: string; dark: string };
  gradient?: string;
  hoverBorder?: string;
}

export interface KiroImportAccountData {
  id?: string;
  email?: string;
  label?: string;
  status?: string;
  accessToken?: string;
  refreshToken: string;
  expiresAt?: string;
  provider?: string;
  userId?: string;
  clientId?: string;
  clientSecret?: string;
  region?: string;
  profileArn?: string;
  machineId?: string;
  password?: string;
}

export interface KiroBatchImportResult {
  email: string;
  provider: string;
  status: 'success' | 'failed' | 'duplicate' | 'skipped';
  error?: string;
  file_path?: string;
}

export interface KiroBatchImportResponse {
  status: string;
  success: number;
  failed: number;
  duplicate: number;
  skipped: number;
  total: number;
  results: KiroBatchImportResult[];
}
