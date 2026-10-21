// File-type checks and small formatting helpers. Pure, so they can be unit tested.

const imageTypes = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/bmp",
  "image/tiff",
  "image/x-png",
]);

const imageExtensions = new Set(["png", "jpg", "jpeg", "webp", "bmp", "tif", "tiff"]);

export function getFileExtension(fileName) {
  const name = String(fileName || "");
  return name.includes(".") ? name.split(".").pop().toLowerCase() : "";
}

export function isPdfFile(file) {
  return file?.type === "application/pdf" || getFileExtension(file?.name) === "pdf";
}

export function isImageFile(file) {
  return imageTypes.has(file?.type) || imageExtensions.has(getFileExtension(file?.name));
}

export function isSupportedFile(file) {
  return isPdfFile(file) || isImageFile(file);
}

export function formatBytes(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

export function getClipboardImageFile(items) {
  const imageItem = Array.from(items || []).find((item) => item.kind === "file" && item.type?.startsWith("image/"));
  const file = imageItem?.getAsFile?.();
  if (!file) {
    return null;
  }

  const subtype = file.type?.split("/")[1] || "png";
  const extension = subtype === "jpeg" ? "jpg" : subtype;
  return new File([file], `clipboard-image.${extension}`, { type: file.type || "image/png" });
}

export function isMacPlatform(platformName) {
  return /mac|iphone|ipad|ipod/i.test(platformName || "");
}
