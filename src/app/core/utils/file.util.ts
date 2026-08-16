const arrayBufferToBinary = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return binary;
};

export const arrayBufferToBase64 = (buffer: ArrayBuffer): string => btoa(arrayBufferToBinary(buffer));

export const fileToBase64 = async (file: File): Promise<string> => arrayBufferToBase64(await file.arrayBuffer());

export const computeSha256Hex = async (file: File): Promise<string> => {
  const buffer = await file.arrayBuffer();
  const hash = await crypto.subtle.digest('SHA-256', buffer);

  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
};

export const base64ToBlob = (base64: string, contentType = 'application/octet-stream'): Blob => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new Blob([bytes], { type: contentType });
};

export const triggerBrowserDownload = (filename: string, blob: Blob): void => {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(objectUrl);
};

export const extractFileName = (logicalPath: string): string => {
  const segments = logicalPath.split('/').filter(Boolean);

  return segments.at(-1) ?? 'download';
};

export const extractParentFolder = (logicalPath: string): string => {
  const normalizedPath = logicalPath.trim();
  const lastSlashIndex = normalizedPath.lastIndexOf('/');

  if (lastSlashIndex <= 0) {
    return '/';
  }

  return normalizedPath.slice(0, lastSlashIndex);
};

export interface FolderNode {
  name: string;
  path: string;
  children: FolderNode[];
  files: import('../models/api.models').FileListingResponse[];
}

export const buildFolderTree = (
  allFiles: import('../models/api.models').FileListingResponse[]
): FolderNode => {
  const root: FolderNode = { name: '/', path: '/', children: [], files: [] };

  const getOrCreateFolder = (segments: string[], parent: FolderNode, builtPath: string): FolderNode => {
    if (segments.length === 0) {
      return parent;
    }

    const [head, ...tail] = segments;
    const childPath = `${builtPath === '/' ? '' : builtPath}/${head}`;
    let child = parent.children.find((c) => c.name === head);

    if (!child) {
      child = { name: head, path: childPath, children: [], files: [] };
      parent.children.push(child);
    }

    return getOrCreateFolder(tail, child, childPath);
  };

  for (const file of allFiles) {
    const segments = file.logicalPath.split('/').filter(Boolean);
    const folderSegments = segments.slice(0, -1);
    const folder = getOrCreateFolder(folderSegments, root, '/');
    folder.files.push(file);
  }

  return root;
};
