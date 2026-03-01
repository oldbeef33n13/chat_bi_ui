const HEX: readonly string[] = Array.from({ length: 256 }, (_, idx) => idx.toString(16).padStart(2, "0"));

const fillRandomBytes = (bytes: Uint8Array): void => {
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(bytes);
    return;
  }
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
};

const formatUuid = (bytes: Uint8Array): string => {
  const hex = Array.from(bytes, (value) => HEX[value]!);
  return `${hex[0]}${hex[1]}${hex[2]}${hex[3]}-${hex[4]}${hex[5]}-${hex[6]}${hex[7]}-${hex[8]}${hex[9]}-${hex[10]}${hex[11]}${hex[12]}${hex[13]}${hex[14]}${hex[15]}`;
};

export const randomUUID = (): string => {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  fillRandomBytes(bytes);
  const byte6 = bytes[6] ?? 0;
  const byte8 = bytes[8] ?? 0;
  bytes[6] = (byte6 & 0x0f) | 0x40;
  bytes[8] = (byte8 & 0x3f) | 0x80;
  return formatUuid(bytes);
};

export const prefixedId = (prefix: string, size = 8): string => `${prefix}_${randomUUID().replace(/-/g, "").slice(0, size)}`;
