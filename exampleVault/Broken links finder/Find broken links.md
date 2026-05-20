# Find broken links

This Safe JS block scans only notes in this folder and reports links that point to missing notes in the same folder.

```safe-js
// @permission vault:read
// @permission metadata:read
// @permission helpers:use

const folder = "Broken links finder";
const listed = await api.vault.list(folder);
const notes = listed.files
	.filter(file => file.type === "file" && file.extension === "md")
	.sort((left, right) => left.path.localeCompare(right.path));
const brokenLinks = [];

function decodeLinkTarget(target) {
	try {
		return decodeURIComponent(target);
	} catch {
		return target.replace(/%20/gu, " ");
	}
}

function isExternalLink(target) {
	return /^[a-z][a-z0-9+.-]*:/iu.test(target);
}

async function scopedTargetPath(linkText, sourcePath) {
	let target = await api.link.getLinkpath(linkText);
	if (target.length === 0 || target.startsWith("#") || isExternalLink(target)) {
		return null;
	}

	target = decodeLinkTarget(target);
	if (target.split("/").includes("..")) {
		return null;
	}

	if (!target.endsWith(".md")) {
		target = `${target}.md`;
	}

	if (target.startsWith(`${folder}/`)) {
		return await api.path.normalize(target);
	}

	const sourceFolder = sourcePath.slice(0, sourcePath.lastIndexOf("/"));
	if (target.includes("/")) {
		return await api.path.normalize(`${sourceFolder}/${target}`);
	}

	return await api.path.normalize(`${folder}/${target}`);
}

function collectCachedLinks(cache) {
	const links = [];
	for (const entry of [...(cache?.links ?? []), ...(cache?.embeds ?? [])]) {
		if (typeof entry.link === "string") {
			links.push(entry.link);
		}
	}

	return links;
}

function isInScope(path) {
	return path === folder || path.startsWith(`${folder}/`);
}

for (const note of notes) {
	const { value: cache } = await api.metadata.getFileCache(note.path);
	for (const link of collectCachedLinks(cache)) {
		const targetPath = await scopedTargetPath(link, note.path);
		const resolved = targetPath === null ? null : await api.metadata.getFirstLinkpathDest(targetPath, note.path);
		if (targetPath !== null && isInScope(targetPath) && resolved === null) {
			brokenLinks.push(`${note.path} -> ${link}`);
		}
	}
}

if (brokenLinks.length === 0) {
	return `No broken links found in ${folder}.`;
}

return [`Broken links in ${folder}:`, "", ...brokenLinks].join("\n");
```
