export const compressImage = async (file: File, quality = 0.7): Promise<File> => {
  if (!file.type.startsWith('image/')) return file;
  
  // Don't compress small images or GIFs
  if (file.type === 'image/gif' || file.size < 500 * 1024) return file;

  // Bolt: Use URL.createObjectURL instead of FileReader.readAsDataURL to avoid
  // CPU-heavy Base64 encoding and reduce memory overhead by ~33%.
  const url = URL.createObjectURL(file);

  return new Promise((resolve) => {
    const img = new Image();

    // Helper for cleanup and resolving
    const cleanupAndResolve = (result: File) => {
      URL.revokeObjectURL(url);
      resolve(result);
    };

    img.src = url;

    // Bolt: img.decode() provides non-blocking, off-main-thread image decoding.
    img.decode()
      .then(() => {
        // Calculate new dimensions (max 1920x1080 bounding box roughly)
        const MAX_WIDTH = 1920;
        const MAX_HEIGHT = 1080;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          cleanupAndResolve(file); // Fallback to original
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob((blob) => {
          if (!blob) {
            cleanupAndResolve(file);
            return;
          }
          // Convert back to File
          const compressedFile = new File([blob], file.name, {
            type: 'image/jpeg',
            lastModified: Date.now(),
          });
          
          // Return the compressed file ONLY if it's actually smaller
          if (compressedFile.size < file.size) {
            cleanupAndResolve(compressedFile);
          } else {
            cleanupAndResolve(file);
          }
        }, 'image/jpeg', quality);
      })
      .catch((err) => {
        console.warn('[ImageCompression] Decode failed, falling back to original:', err);
        cleanupAndResolve(file); // Fallback on error
      });
  });
};
