export type DeleteTargetType =
  | 'collection'
  | 'folder'
  | 'endpoint'
  | 'environment'
  | 'workspace'
  | 'saved_response';

export interface DeleteConfirmationConfig {
  title: string;
  message: string;
  requireCheckbox: boolean;
  checkboxLabel?: string;
  confirmButtonText: string;
}

/**
 * Returns user-facing confirmation dialog copy and requirements based on entity type.
 */
export function getDeleteConfirmationConfig(
  type: DeleteTargetType,
  name?: string
): DeleteConfirmationConfig {
  const safeName = name ? `"${name}"` : 'this item';

  switch (type) {
    case 'collection':
      return {
        title: 'Delete Collection',
        message: `Are you sure you want to delete ${safeName}? All folders and endpoints within it will be permanently deleted.`,
        requireCheckbox: true,
        checkboxLabel: 'I understand that deleted collections cannot be undone',
        confirmButtonText: 'Delete Collection',
      };
    case 'folder':
      return {
        title: 'Delete Folder',
        message: `Are you sure you want to delete folder ${safeName}? All subfolders and endpoints inside it will be permanently deleted.`,
        requireCheckbox: false,
        confirmButtonText: 'Delete Folder',
      };
    case 'endpoint':
      return {
        title: 'Delete Endpoint',
        message: `Are you sure you want to delete endpoint ${safeName}? This action cannot be undone.`,
        requireCheckbox: false,
        confirmButtonText: 'Delete Endpoint',
      };
    case 'environment':
      return {
        title: 'Delete Environment',
        message: `Are you sure you want to delete environment ${safeName}? All associated variables will be permanently removed.`,
        requireCheckbox: false,
        confirmButtonText: 'Delete Environment',
      };
    case 'saved_response':
      return {
        title: 'Delete Saved Response',
        message: 'Are you sure you want to delete this saved response? It will be permanently removed.',
        requireCheckbox: false,
        confirmButtonText: 'Delete Response',
      };
    case 'workspace':
      return {
        title: 'Delete Workspace',
        message: `Are you sure you want to delete workspace ${safeName}? All associated collections and environments will be permanently deleted.`,
        requireCheckbox: false,
        confirmButtonText: 'Delete Workspace',
      };
  }
}

/**
 * Validates whether the confirm delete action button can be triggered.
 */
export function canExecuteDelete(
  requireCheckbox: boolean,
  isChecked: boolean,
  isPending: boolean = false
): boolean {
  if (isPending) return false;
  if (requireCheckbox && !isChecked) return false;
  return true;
}
