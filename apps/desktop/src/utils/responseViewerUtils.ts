import { getGrpcStatusLabel } from './grpcSpecification.ts';

/**
 * Formats byte size into human-readable B / KB / MB.
 */
export function formatResponseSize(bytes: number): string {
  if (!bytes || bytes <= 0 || isNaN(bytes)) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Formats elapsed response time into ms or s.
 */
export function formatElapsedTime(ms: number): string {
  if (!ms || ms <= 0 || isNaN(ms)) return '0 ms';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 10000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 1000).toFixed(0)}s`;
}

export interface StatusBadgeInfo {
  label: string;
  isSuccess: boolean;
  isWarning: boolean;
  isError: boolean;
}

/**
 * Formats HTTP or gRPC status code into a standard label and tone.
 */
export function formatStatusCode(
  protocol: 'http' | 'grpc',
  code: number,
  statusText?: string
): StatusBadgeInfo {
  if (protocol === 'http') {
    const isSuccess = code >= 200 && code < 300;
    const isWarning = code >= 300 && code < 400;
    const isError = code >= 400 || code === 0;
    const textPart = statusText ? ` ${statusText}` : '';
    return {
      label: `${code}${textPart}`.trim(),
      isSuccess,
      isWarning,
      isError,
    };
  }

  // gRPC
  const isSuccess = code === 0;
  const isError = code !== 0;
  const canonical = getGrpcStatusLabel(code, statusText);
  return {
    label: `${code} ${canonical}`.trim(),
    isSuccess,
    isWarning: false,
    isError,
  };
}
