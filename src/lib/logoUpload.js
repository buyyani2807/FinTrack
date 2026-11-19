/**
 * Shared "upload a logo" helper. Reads an image file the person picked, downscales it to a
 * sane size, and returns a JPEG data: URL — the same shape every logo field in the app stores
 * (Accounts document settings, and now Business details too). A data URL embeds straight into
 * generated PDFs (see documentPdf.js's decodeJpegDataUrl), unlike an external http(s) link,
 * which never worked there and depends on a site staying up.
 */
export const LOGO_MAX_CHARS = 400000;

export function readLogoFile(file) {
  return new Promise((resolve, reject) => {
    if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) {
      reject(new Error("Choose a PNG, JPG or WebP image."));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read this image."));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("Could not read this image."));
      image.onload = () => {
        const scale = Math.min(1, 320 / Math.max(image.width, image.height));
        const width = Math.max(1, Math.round(image.width * scale));
        const height = Math.max(1, Math.round(image.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, width, height);
        context.drawImage(image, 0, 0, width, height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
        if (dataUrl.length > LOGO_MAX_CHARS) reject(new Error("This logo is too large. Use a smaller image."));
        else resolve(dataUrl);
      };
      image.src = String(reader.result || "");
    };
    reader.readAsDataURL(file);
  });
}
