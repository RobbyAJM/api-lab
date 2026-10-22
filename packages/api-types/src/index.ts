export type Role = 'admin' | 'developer';
export type Protocol = 'http' | 'grpc';
export type InvitationStatus = 'pending' | 'accepted' | 'revoked';

export interface UserSummary {
  id: string;
  email: string;
  name: string;
  role: string;
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  role: Role;
}

export interface AuthResponse {
  token: string;
  user: UserSummary;
  workspace?: WorkspaceSummary;
}

export interface MemberResponse {
  id: string;
  user_id: string;
  email: string;
  name: string;
  role: Role;
  created_at: string;
}

export interface InvitationResponse {
  id: string;
  workspace_id: string;
  token?: string;
  role: Role;
  inviter_id: string;
  expires_at: string;
  status: InvitationStatus;
  created_at: string;
}

export interface CollectionAuthSettings {
  auth_type: 'inherit' | 'none' | 'bearer' | 'basic' | 'custom';
  token?: string;
  username?: string;
  password?: string;
  header_name?: string;
  header_value?: string;
}

export interface CollectionHeaderSetting {
  key: string;
  value: string;
  enabled?: boolean;
  description?: string;
}

export interface CollectionSettings {
  auth?: CollectionAuthSettings;
  headers?: CollectionHeaderSetting[];
  timeout_ms?: number;
  description?: string;
}

export interface Collection {
  id: string;
  workspace_id: string;
  name: string;
  settings?: CollectionSettings;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface CollectionFolder {
  id: string;
  collection_id: string;
  parent_folder_id?: string | null;
  name: string;
  grpc_url?: string | null;
  swagger_url?: string | null;
  settings?: Record<string, any>;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Endpoint {
  id: string;
  collection_id: string;
  folder_id?: string | null;
  name: string;
  protocol: Protocol;
  config: Record<string, any>;
  sort_order: number;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface Environment {
  id: string;
  workspace_id: string;
  name: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface VariableResponse {
  id: string;
  environment_id: string;
  key: string;
  value: string;
  is_sensitive: boolean;
  created_at: string;
  updated_at: string;
}

export interface SavedResponse {
  id: string;
  endpoint_id: string;
  workspace_id: string;
  created_by: string;
  status_code: number;
  response_headers: Record<string, string>;
  response_body: string;
  response_time_ms: number;
  response_size_bytes: number;
  created_at: string;
  updated_at: string;
}

export interface HttpAuth {
  auth_type: 'inherit' | 'none' | 'bearer' | 'basic' | 'custom';
  token?: string;
  username?: string;
  password?: string;
  header_name?: string;
  header_value?: string;
}

export interface HttpExecutionRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  query_params: [string, string][];
  body?: string;
  body_type?: 'none' | 'json' | 'text' | 'form' | 'multipart' | 'binary';
  auth?: HttpAuth;
  timeout_ms?: number;
}

export interface HttpExecutionResponse {
  status_code: number;
  status_text: string;
  response_time_ms: number;
  response_size_bytes: number;
  headers: Record<string, string>;
  body: string;
  error?: string;
}

export interface GrpcExecutionRequest {
  server_address: string;
  service: string;
  method: string;
  metadata: Record<string, string>;
  payload: any;
  timeout_ms?: number;
  use_tls?: boolean;
  auth?: HttpAuth;
}

export interface GrpcExecutionResponse {
  status_code: number;
  status_message: string;
  response_time_ms: number;
  response_size_bytes: number;
  metadata: Record<string, string>;
  body: any;
  error?: string;
}

export interface GrpcReflectionRequest {
  server_address: string;
  use_tls?: boolean;
}

export interface GrpcMethodSummary {
  name: string;
  input_type: string;
  output_type: string;
  is_client_streaming?: boolean;
  is_server_streaming?: boolean;
  stream_type?: 'unary' | 'omni_stream' | 'bidi_stream';
}

export interface GrpcServiceSummary {
  name: string;
  methods: GrpcMethodSummary[];
}

export interface GrpcReflectionResponse {
  services: GrpcServiceSummary[];
  error?: string;
}

export interface GrpcSamplePayloadRequest {
  server_address: string;
  service: string;
  method: string;
  use_tls?: boolean;
}

export interface GrpcSamplePayloadResponse {
  payload: any;
  error?: string;
}

export interface WsSyncEvent {
  workspace_id: string;
  entity: string;
  action: string;
  entity_id: string;
}
