/**
 * Extract module name from file path.
 * Returns the top-level directory name under src/, or 'root' for files directly in src/.
 * Returns null if the path doesn't contain a src/ directory.
 */
export function extractModuleName(filePath: string): string | null {
  // Normalize path separators to forward slash for cross-platform compatibility
  const normalized = filePath.replace(/\\/g, '/');
  const parts = normalized.split('/');
  const srcIndex = parts.indexOf('src');
  if (srcIndex >= 0 && srcIndex + 1 < parts.length) {
    const nextPart = parts[srcIndex + 1];
    // If the next part is a file (has extension), it's in the root module
    if (nextPart.includes('.')) {
      return 'root';
    }
    return nextPart;
  }
  return null;
}

/**
 * Extract module name from file path, returning 'root' as fallback.
 */
export function extractModuleNameOrRoot(filePath: string): string {
  return extractModuleName(filePath) ?? 'root';
}
