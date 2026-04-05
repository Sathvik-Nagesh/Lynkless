import { zip } from 'fflate';

/**
 * Creates a ZIP archive from an array of files.
 * Bolt: Optimized using Promise.all() and file.arrayBuffer() for faster, parallel reading.
 * Replaces the legacy FileReader API with modern asynchronous data access.
 */
export const createZipFromFiles = async (files: File[], zipName = 'Archive.zip'): Promise<File> => {
  const zippedFiles: Record<string, Uint8Array> = {};

  // Read all files in parallel using modern Promise-based APIs
  // This avoids the overhead of manual counter management and the legacy FileReader event loop.
  await Promise.all(
    files.map(async (file) => {
      // Bolt: Preserve directory structure via webkitRelativePath if present.
      // Replaces 'any' cast with a safer partial interface type assertion.
      const path = (file as { webkitRelativePath?: string }).webkitRelativePath || file.name;
      
      // Bolt: file.arrayBuffer() is an asynchronous, Promise-based alternative to FileReader.
      // It is cleaner and more efficient in modern browser environments.
      const buffer = await file.arrayBuffer();
      zippedFiles[path] = new Uint8Array(buffer);
    })
  );

  return new Promise((resolve, reject) => {
    // Bolt: Perform the ZIP compression at level 6 (standard balance of speed/ratio).
    zip(zippedFiles, { level: 6 }, (err, zippedData) => {
      if (err) {
        reject(err);
      } else {
        // Bolt: Cast zippedData.buffer to unknown then to ArrayBuffer to satisfy strict TypeScript rules
        // regarding SharedArrayBuffer vs ArrayBuffer incompatibility in modern Next.js environments.
        const zipBlob = new Blob([zippedData.buffer as unknown as ArrayBuffer], { type: 'application/zip' });
        const zipFile = new File([zipBlob], zipName, {
          type: 'application/zip',
          lastModified: Date.now(),
        });
        resolve(zipFile);
      }
    });
  });
};
