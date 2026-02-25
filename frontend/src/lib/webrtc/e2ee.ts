export class E2EEHelper {
  private static readonly METADATA_SIZE = 28; // 16 bytes salt + 12 bytes IV

  // Derive a 256-bit AES-GCM key from a password
  private static async deriveKey(password: string, salt: Uint8Array, keyUsages: KeyUsage[]): Promise<CryptoKey> {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      enc.encode(password),
      { name: "PBKDF2" },
      false,
      ["deriveBits", "deriveKey"]
    );
    
    return crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: salt as any,
        iterations: 100000,
        hash: "SHA-256"
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      keyUsages
    );
  }

  static async encryptFile(file: File, password?: string): Promise<File> {
    if (!password) return file;

    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const key = await this.deriveKey(password, salt, ["encrypt"]);
    const arrayBuffer = await file.arrayBuffer();
    
    // Encrypt the entire file
    const encryptedData = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      arrayBuffer
    );

    // Prefix with metadata (salt + iv)
    const resultBuffer = new Uint8Array(salt.length + iv.length + encryptedData.byteLength);
    resultBuffer.set(salt, 0);
    resultBuffer.set(iv, salt.length);
    resultBuffer.set(new Uint8Array(encryptedData), salt.length + iv.length);

    // Use .encrypted extension and custom mime type to tag it
    return new File([resultBuffer], `${file.name}.encrypted`, { type: 'application/octet-stream' });
  }

  static async decryptFile(file: File, password?: string): Promise<File> {
    if (!password || !file.name.endsWith('.encrypted')) return file;

    const arrayBuffer = await file.arrayBuffer();
    if (arrayBuffer.byteLength <= this.METADATA_SIZE) {
      throw new Error("Invalid encrypted file: too small");
    }

    const salt = new Uint8Array(arrayBuffer.slice(0, 16));
    const iv = new Uint8Array(arrayBuffer.slice(16, 28));
    const encryptedData = arrayBuffer.slice(28);

    const key = await this.deriveKey(password, salt, ["decrypt"]);
    
    try {
      const decryptedData = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        key,
        encryptedData
      );

      // Remove .encrypted from filename
      const originalName = file.name.replace(/\.encrypted$/, '');
      return new File([decryptedData], originalName);
    } catch (e) {
      console.error(e);
      throw new Error("Decryption failed. Incorrect password?");
    }
  }
}
