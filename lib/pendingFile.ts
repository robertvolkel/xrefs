import { ParsedSpreadsheet } from './types';

export interface PendingFileData {
  file?: File;
  parsedData?: ParsedSpreadsheet;
  name: string;
  description: string;
  customer: string;
  defaultViewId: string;
}

let pending: PendingFileData | null = null;

export function setPendingFile(file: File, name: string, description: string, customer: string = '', defaultViewId: string = '') {
  pending = { file, name, description, customer, defaultViewId };
}

export function setPendingParsedData(parsed: ParsedSpreadsheet, name: string, description: string, customer: string = '', defaultViewId: string = '') {
  pending = { parsedData: parsed, name, description, customer, defaultViewId };
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
