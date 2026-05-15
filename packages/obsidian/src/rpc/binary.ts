import { arrayBufferToBase64, base64ToArrayBuffer } from 'obsidian';

export function encodeArrayBuffer(buffer: ArrayBuffer): string {
	return arrayBufferToBase64(buffer);
}

export function decodeArrayBuffer(base64: string): ArrayBuffer {
	return base64ToArrayBuffer(base64);
}
