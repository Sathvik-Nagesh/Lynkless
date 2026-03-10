import { zip, strToU8 } from 'fflate';

export const createZipFromFiles = async (files: File[], zipName = 'Archive.zip'): Promise<File> => {
  return new Promise((resolve, reject) => {
    const zippedFiles: Record<string, Uint8Array | [Uint8Array, { level: 6 }]> = {};
    
    let processedRawFiles = 0;
    
    // Read all files asynchronously
    for (const file of files) {
      // Determine the path. fallback to just the file name
      const path = (file as any).webkitRelativePath || file.name;
      
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target && e.target.result) {
          const buffer = new Uint8Array(e.target.result as ArrayBuffer);
          zippedFiles[path] = buffer;
        }
        processedRawFiles++;
        
        // Once all files are read, compress them
        if (processedRawFiles === files.length) {
          zip(zippedFiles, { level: 6 }, (err, zippedData) => {
            if (err) {
              reject(err);
            } else {
              const zipBlob = new Blob([zippedData.buffer as ArrayBuffer], { type: 'application/zip' });
              const zipFile = new File([zipBlob], zipName, {
                type: 'application/zip',
                lastModified: Date.now()
              });
              resolve(zipFile);
            }
          });
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file: ' + file.name));
      reader.readAsArrayBuffer(file);
    }
  });
};
