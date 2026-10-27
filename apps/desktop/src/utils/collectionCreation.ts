// ponytail: single-field name validator; upgrade to full collection settings schema when folder/auth presets added to creation flow.
export interface CollectionValidationResult {
  valid: boolean;
  name: string;
  error?: string;
}

export function validateCollectionName(rawName: string): CollectionValidationResult {
  const name = rawName.trim();
  if (!name) {
    return { valid: false, name: '', error: 'Collection name cannot be empty' };
  }
  if (name.length > 100) {
    return { valid: false, name, error: 'Collection name must be 100 characters or less' };
  }
  return { valid: true, name };
}

export function buildCreateCollectionPayload(name: string, settings?: Record<string, unknown>) {
  return {
    name: name.trim(),
    settings: settings ?? {},
  };
}
