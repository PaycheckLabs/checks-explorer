declare module "qrcode-generator-es6" {
  type QRErrorCorrectionLevel = "L" | "M" | "Q" | "H";

  export default class QRCode {
    constructor(typeNumber?: number, errorCorrectionLevel?: QRErrorCorrectionLevel);
    addData(data: string): void;
    make(): void;
    createSvgTag(options?: { cellSize?: number; margin?: number }): string;
  }
}
