/// <reference types="vite/client" />

type FileSystemWriteChunkType = BufferSource | Blob | string;

interface FileSystemWritableFileStream extends WritableStream {
  write(data: FileSystemWriteChunkType): Promise<void>;
  close(): Promise<void>;
}

interface FileSystemFileHandle {
  readonly name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<FileSystemWritableFileStream>;
}

interface FilePickerAcceptType {
  description?: string;
  accept: Record<string, string[]>;
}

interface Window {
  showSaveFilePicker?: (options?: {
    suggestedName?: string;
    id?: string;
    excludeAcceptAllOption?: boolean;
    types?: FilePickerAcceptType[];
  }) => Promise<FileSystemFileHandle>;
  showOpenFilePicker?: (options?: {
    multiple?: boolean;
    id?: string;
    excludeAcceptAllOption?: boolean;
    types?: FilePickerAcceptType[];
  }) => Promise<FileSystemFileHandle[]>;
}
