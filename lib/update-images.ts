import { MAX_FILE_SIZE } from "./files";
export const updateImageTypes = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
];
export const MAX_UPDATE_IMAGES = 6;
export function validUpdateImage(file: { size: number; type: string }) {
  return (
    file.size > 0 &&
    file.size <= MAX_FILE_SIZE &&
    updateImageTypes.includes(file.type)
  );
}
export function validImageSignature(bytes: Uint8Array, type: string) {
  const text = new TextDecoder();
  return type === "image/png"
    ? Array.from(bytes.slice(0, 8)).join(",") === "137,80,78,71,13,10,26,10"
    : type === "image/jpeg"
      ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
      : type === "image/gif"
        ? /^GIF8[79]a$/.test(text.decode(bytes.slice(0, 6)))
        : type === "image/webp"
          ? text.decode(bytes.slice(0, 4)) === "RIFF" &&
            text.decode(bytes.slice(8, 12)) === "WEBP"
          : false;
}
