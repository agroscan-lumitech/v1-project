const IMAGE_SIGNATURES = {
  "image/jpeg": buffer => buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff,
  "image/png": buffer => buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])),
  "image/gif": buffer => buffer.length >= 6 && ["GIF87a","GIF89a"].includes(buffer.subarray(0,6).toString("ascii")),
  "image/webp": buffer => buffer.length >= 12 && buffer.subarray(0,4).toString("ascii")==="RIFF" && buffer.subarray(8,12).toString("ascii")==="WEBP"
};

export function isAllowedImageUpload(file) {
  if (!file?.buffer || !Buffer.isBuffer(file.buffer)) return false;
  const signatureCheck = IMAGE_SIGNATURES[file.mimetype];
  return Boolean(signatureCheck && signatureCheck(file.buffer));
}

export function parseBoundedNumber(value, min, max, { optional = false } = {}) {
  if ((value === undefined || value === null || value === "") && optional) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return null;
  return parsed;
}

export function validateOrderItems(items) {
  if (!Array.isArray(items) || items.length < 1 || items.length > 20) return null;
  const normalized = [];
  for (const item of items) {
    const name = typeof item?.name === "string" ? item.name.trim() : "";
    const quantity = parseBoundedNumber(item?.qty, 1, 1000);
    const price = parseBoundedNumber(item?.price, 0, 500000);
    if (!name || name.length > 120 || !Number.isInteger(quantity) || price === null) return null;
    if (!Number.isFinite(quantity * price) || quantity * price > 10000000) return null;
    normalized.push({ name, qty: quantity, price });
  }
  return normalized;
}

export function sanitizeTextField(value, maxLength) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}
