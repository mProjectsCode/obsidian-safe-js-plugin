export async function hashCode(code: string): Promise<string> {
	const cryptoApi = crypto;
	if (cryptoApi?.subtle !== undefined) {
		const digest = await cryptoApi.subtle.digest('SHA-256', new TextEncoder().encode(code));
		return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
	}

	return fallbackHash(code);
}

function fallbackHash(value: string): string {
	let hash = 0x811c9dc5;
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193);
	}

	return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}
