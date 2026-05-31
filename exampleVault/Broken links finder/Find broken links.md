This Safe JS block scans only notes in this folder and reports links that point to missing notes in the same folder as a nested Markdown list.

```safe-js
// @permission vault:read
// @permission metadata:read
// @permission helpers:use
// @permission output:render-rich

const folder = "Broken links finder";
const listed = await api.vault.list(folder);
const notes = listed.files
	.filter(file => file.type === "file" && file.extension === "md")
	.sort((left, right) => left.path.localeCompare(right.path));
const brokenLinksByNote = new Map();

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
	const link = await api.link.parseLinktext(linkText);
	let target = link.path;
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

function basename(path) {
	const parts = path.split("/");
	return parts[parts.length - 1] ?? path;
}

function displayName(path) {
	const name = basename(path);
	return name.endsWith(".md") ? name.slice(0, -3) : name;
}

function escapeWikiAlias(alias) {
	return alias.replace(/\|/gu, "\\|").replace(/\n/gu, " ");
}

function wikiLink(path, alias = displayName(path)) {
	return `[[${path}|${escapeWikiAlias(alias)}]]`;
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
			const brokenLinks = brokenLinksByNote.get(note.path) ?? [];
			brokenLinks.push({ link, targetPath });
			brokenLinksByNote.set(note.path, brokenLinks);
		}
	}
}

if (brokenLinksByNote.size === 0) {
	return {
		format: "markdown",
		content: `No broken links found in ${folder}.`,
	};
}

const lines = [`Broken links in ${folder}:`, ""];
for (const [notePath, brokenLinks] of [...brokenLinksByNote.entries()].sort(([left], [right]) => left.localeCompare(right))) {
	lines.push(`- ${wikiLink(notePath)}`);
	for (const brokenLink of brokenLinks.sort((left, right) => left.targetPath.localeCompare(right.targetPath))) {
		lines.push(`  - ${wikiLink(brokenLink.targetPath, brokenLink.link)}`);
	}
}

return {
	format: "markdown",
	content: lines.join("\n"),
};
```
