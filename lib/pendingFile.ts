interface PendingFileData {
  file: File;
  name: string;
  description: string;
}

let pending: PendingFileData | null = null;

export function setPendingFile(file: File, name: string, description: string) {
  pending = { file, name, description };
}

/** Check if there's a pending file without consuming it */
export function peekPendingFile(): boolean {
  return pending !== null;
}

export function consumePendingFile(): PendingFileData | null {
  const p = pending;
  pending = null;
  return p;
}
