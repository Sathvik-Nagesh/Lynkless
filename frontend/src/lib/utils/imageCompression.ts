export const compressImage = async (file: File, quality = 0.7): Promise<File> => {
  if (!file.type.startsWith('image/')) return file;
  
  // Don't compress small images or GIFs
  if (file.type === 'image/gif' || file.size < 500 * 1024) return file;

  return new Promise((resolve) => {
    // Bolt: Use URL.createObjectURL(file) instead of FileReader.readAsDataURL to avoid
    // CPU-heavy Base64 encoding and reduce memory pressure by ~33%.
    const imageUrl = URL.createObjectURL(file);
    const img = new Image();

    const cleanup = () => URL.revokeObjectURL(imageUrl);

    img.onload = () => {
      cleanup();
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
          resolve(file); // Fallback to original
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob((blob) => {
          if (!blob) {
            resolve(file);
            return;
          }
          // Convert back to File
          const compressedFile = new File([blob], file.name, {
            type: 'image/jpeg',
            lastModified: Date.now(),
          });
          
          // Return the compressed file ONLY if it's actually smaller
          if (compressedFile.size < file.size) {
            resolve(compressedFile);
          } else {
            resolve(file);
          }
        }, 'image/jpeg', quality);
    };

    img.onerror = () => {
      cleanup();
      resolve(file); // Fallback on error
    };

    // Bolt: Assign img.src AFTER onload/onerror are defined to ensure the image
    // loading cycle is captured correctly in all browsers.
    img.src = imageUrl;
  });
};
