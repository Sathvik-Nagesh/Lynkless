import { zip } from 'fflate';

/**
 * Creates a ZIP file from an array of Files.
 * Bolt: Optimized with Promise.all() and file.arrayBuffer() for parallel processing,
 * significantly improving performance over legacy FileReader operations.
 */
export const createZipFromFiles = async (files: File[], zipName = 'Archive.zip'): Promise<File> => {
  // Bolt: Read all files in parallel using the modern Promise-based arrayBuffer() API.
  // This utilizes multi-core potential for reading from disk/cache.
  const fileData = await Promise.all(
    files.map(async (file) => {
      const path = (file as { webkitRelativePath?: string }).webkitRelativePath || file.name;
      const buffer = await file.arrayBuffer();
      return { path, data: new Uint8Array(buffer) };
    })
  );

  const zippedFiles: Record<string, Uint8Array> = {};
  for (const item of fileData) {
    zippedFiles[item.path] = item.data;
  }

  return new Promise((resolve, reject) => {
    zip(zippedFiles, { level: 6 }, (err, zippedData) => {
      if (err) {
        reject(err);
      } else {
        // Bolt: Pass the Uint8Array directly to the File constructor.
        // We wrap it in a new Uint8Array to satisfy strict TypeScript BlobPart constraints
        // and ensure compatibility with various SharedArrayBuffer subtypes in the build environment.
        const zipFile = new File([new Uint8Array(zippedData)], zipName, {
          type: 'application/zip',
          lastModified: Date.now()
        });
        resolve(zipFile);
      }
    });
  });
};
