import test from "node:test";
import assert from "node:assert/strict";
import { isAllowedImageUpload, parseBoundedNumber, validateOrderItems, sanitizeTextField } from "../security-utils.js";

test("image uploads must match their declared image type", () => {
  assert.equal(isAllowedImageUpload({ mimetype:"image/png", buffer:Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]) }), true);
  assert.equal(isAllowedImageUpload({ mimetype:"image/jpeg", buffer:Buffer.from([0xff,0xd8,0xff,0x00]) }), true);
  assert.equal(isAllowedImageUpload({ mimetype:"image/gif", buffer:Buffer.from("GIF89a") }), true);
  assert.equal(isAllowedImageUpload({ mimetype:"image/webp", buffer:Buffer.from("RIFF0000WEBP") }), true);
  assert.equal(isAllowedImageUpload({ mimetype:"image/png", buffer:Buffer.from("<script>") }), false);
  assert.equal(isAllowedImageUpload({ mimetype:"text/html", buffer:Buffer.from("GIF89a") }), false);
});

test("bounded numeric parsing rejects malformed and out-of-range values", () => {
  assert.equal(parseBoundedNumber("7.2", 0, 14), 7.2);
  assert.equal(parseBoundedNumber("15", 0, 14), null);
  assert.equal(parseBoundedNumber("nope", 0, 14), null);
  assert.equal(parseBoundedNumber(undefined, -50, 80, { optional:true }), null);
});

test("order items require safe names, integer quantities and bounded prices", () => {
  assert.deepEqual(validateOrderItems([{ name:"Seed pack", qty:"2", price:"125" }]), [{ name:"Seed pack", qty:2, price:125 }]);
  assert.equal(validateOrderItems([]), null);
  assert.equal(validateOrderItems([{ name:"Seed", qty:0, price:10 }]), null);
  assert.equal(validateOrderItems([{ name:"Seed", qty:1.5, price:10 }]), null);
  assert.equal(validateOrderItems([{ name:"Seed", qty:1, price:-1 }]), null);
  assert.equal(validateOrderItems([{ name:"x".repeat(121), qty:1, price:1 }]), null);
});

test("text fields are trimmed and bounded", () => {
  assert.equal(sanitizeTextField("  AgroScan  ", 8), "AgroScan");
  assert.equal(sanitizeTextField("   ", 20), null);
  assert.equal(sanitizeTextField(123, 20), null);
});
