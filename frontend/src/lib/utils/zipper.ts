import { zip } from 'fflate';

/**
 * Creates a zip archive from a list of files.
 * Bolt: Optimized using Promise.all and file.arrayBuffer() for concurrent processing
 * and cleaner asynchronous code compared to legacy FileReader.
 */
export const createZipFromFiles = async (files: File[], zipName = 'Archive.zip'): Promise<File> => {
  const zippedFiles: Record<string, Uint8Array> = {};

  // Read all files concurrently using modern arrayBuffer() API
  await Promise.all(
    files.map(async (file) => {
      try {
        const path = (file as any).webkitRelativePath || file.name;
        const buffer = await file.arrayBuffer();
        zippedFiles[path] = new Uint8Array(buffer);
      } catch (err) {
        throw new Error(`Failed to read file: ${file.name}`);
      }
    })
  );

  return new Promise((resolve, reject) => {
    zip(zippedFiles, { level: 6 }, (err, zippedData) => {
      if (err) {
        reject(err);
      } else {
        // Bolt: Use type assertion to avoid SharedArrayBuffer compatibility issues in Next.js environment
        const zipBlob = new Blob([zippedData as any], { type: 'application/zip' });
        const zipFile = new File([zipBlob], zipName, {
          type: 'application/zip',
          lastModified: Date.now()
        });
        resolve(zipFile);
      }
    });
  });
};
