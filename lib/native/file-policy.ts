/**
 * File picker and document policy for native/mobile contexts.
 *
 * Defines:
 * - Allowed MIME types for upload
 * - Maximum file size limits
 * - Metadata stripping expectations
 * - File validation helpers
 *
 * This module gates what files can enter the app through native pickers,
 * share targets, or upload flows.
 */

/** Maximum file size in bytes (20MB) */
export const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024

/** Maximum file size in human-readable form */
export const MAX_FILE_SIZE_DISPLAY = '20 MB'

/** Allowed MIME types for document upload */
export const ALLOWED_MIME_TYPES = [
  // Documents
  'application/pdf',
  'text/plain',
  'text/markdown',
  'text/csv',
  // Images
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/avif',
  // Web content
  'text/html'
] as const

export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number]

/** Blocked MIME types that should never be accepted */
const BLOCKED_MIME_TYPES = [
  'application/javascript',
  'text/javascript',
  'application/x-executable',
  'application/x-msdownload',
  'application/x-sh',
  'application/x-shellscript'
]

export interface FileValidationResult {
  valid: boolean
  reason?: string
}

/**
 * Validate a file against the app's file policy.
 *
 * Checks:
 * - File size within limits
 * - MIME type is allowed
 * - Not in blocked list
 */
export function validateFile(file: {
  size: number
  type: string
  name?: string
}): FileValidationResult {
  // Check size
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      valid: false,
      reason: `File exceeds maximum size of ${MAX_FILE_SIZE_DISPLAY}`
    }
  }

  if (file.size === 0) {
    return { valid: false, reason: 'File is empty' }
  }

  // Check blocked types
  const mimeType = file.type.toLowerCase()
  if (BLOCKED_MIME_TYPES.some(blocked => mimeType === blocked)) {
    return { valid: false, reason: `File type not allowed: ${file.type}` }
  }

  // Reject empty/missing MIME types (deny-by-default)
  if (!mimeType) {
    return { valid: false, reason: 'File type could not be determined' }
  }

  // Check allowed types
  if (!ALLOWED_MIME_TYPES.includes(mimeType as AllowedMimeType)) {
    return { valid: false, reason: `Unsupported file type: ${file.type}` }
  }

  return { valid: true }
}

/**
 * Check if a MIME type is allowed for upload.
 */
export function isAllowedMimeType(mimeType: string): boolean {
  return ALLOWED_MIME_TYPES.includes(mimeType.toLowerCase() as AllowedMimeType)
}

/**
 * Get the file extension from a filename.
 */
export function getFileExtension(filename: string): string {
  const parts = filename.split('.')
  return parts.length > 1 ? `.${parts[parts.length - 1].toLowerCase()}` : ''
}

/**
 * Build accept string for file input elements.
 */
export function getFileInputAccept(): string {
  return ALLOWED_MIME_TYPES.join(',')
}
