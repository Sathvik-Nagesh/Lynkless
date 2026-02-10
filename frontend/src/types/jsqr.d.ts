declare module 'jsqr' {
  interface QRCode {
    binaryData: number[];
    data: string;
    chunks: Array<{
      type: string;
      text: string;
    }>;
    version: number;
    location: {
      topRightCorner: { x: number; y: number };
      topLeftCorner: { x: number; y: number };
      bottomRightCorner: { x: number; y: number };
      bottomLeftCorner: { x: number; y: number };
    };
  }

  function jsQR(
    data: Uint8ClampedArray,
    width: number,
    height: number,
    options?: {
      inversionAttempts?: 'dontInvert' | 'onlyInvert' | 'attemptBoth';
    }
  ): QRCode | null;

  export = jsQR;
}
