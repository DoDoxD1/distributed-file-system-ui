export type ApiErrorCode =
  | 'validation_error'
  | 'not_found'
  | 'version_deleted'
  | 'authentication_error'
  | 'authorization_error'
  | 'user_exists'
  | 'storage_quota_exceeded'
  | 'distributed_fs_error'
  | 'payload_too_large'
  | 'service_unavailable'
  | 'internal_error';

export interface ErrorResponse {
  timestamp: string;
  error: ApiErrorCode | string;
  message: string;
  path: string;
}

export interface UserResponse {
  userId: string;
  email: string;
  displayName: string | null;
  isAdmin: boolean;
  createdAt: string;
}

export interface AuthResponse {
  token: string;
  expiresAt: string;
  user: UserResponse;
}

export interface AuthSession {
  token: string;
  expiresAt: string;
  user: UserResponse;
}

export interface CredentialsRequest {
  email: string;
  password: string;
}

export interface RegistrationRequest {
  email: string;
  password: string;
  displayName?: string | null;
}

export interface UpdateDisplayNameRequest {
  displayName: string;
}

export interface UploadFileRequest {
  logicalPath: string;
  payloadBase64: string;
  idempotencyKey?: string;
}

export interface FileManifestResponse {
  fileId: string;
  ownerUserId: string;
  logicalPath: string;
  versionId: string;
  chunkIds: string[];
  sizeBytes: number;
  checksum: string;
  createdAt: string;
  idempotencyKey: string | null;
  deletedAt: string | null;
  deleted: boolean;
}

export interface UploadFileResponse {
  manifest: FileManifestResponse;
}

export type DirectUploadSessionStatus = 'AWAITING_UPLOAD' | 'READY_TO_COMMIT' | 'COMPLETED';

export interface CreateDirectUploadSessionRequest {
  logicalPath: string;
  checksumSha256: string;
  sizeBytes: number;
  contentType: string;
  idempotencyKey?: string;
}

export interface DirectUploadSessionResponse {
  sessionId: string;
  ownerUserId: string;
  logicalPath: string;
  checksumSha256: string;
  sizeBytes: number;
  contentType: string;
  idempotencyKey: string | null;
  stagingObjectKey: string;
  status: DirectUploadSessionStatus;
  committedVersionId: string | null;
  uploadRequired: boolean;
  uploadUrl: string | null;
  uploadMethod: string;
  uploadHeaders: Record<string, string>;
  createdAt: string;
  expiresAt: string;
}

export interface DownloadFileResponse {
  logicalPath: string;
  versionId: string | null;
  payloadBase64: string;
}

export interface FileListingResponse {
  logicalPath: string;
  latestVersionId: string;
  sizeBytes: number;
  createdAt: string;
}

export interface DeleteFileResponse {
  deletedManifest: FileManifestResponse;
}

export interface HealthResponse {
  status: string;
  database: string;
  checkedAt: string;
}

export interface VersionResponse {
  application: string;
  version: string;
}

export interface WorkerRunResponse {
  worker: string;
  affectedCount: number;
}
