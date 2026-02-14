let pendingFile: File | null = null;

export function setPendingFile(file: File) {
  pendingFile = file;
}

export function consumePendingFile(): File | null {
  const f = pendingFile;
  pendingFile = null;
  return f;
}
