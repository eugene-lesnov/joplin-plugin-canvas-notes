/**
 * Thin wrapper around joplin.data for SVG-resource operations.
 *
 * Joplin Plugin API limitation:
 *   joplin.data.post(['resources'], ...) and PUT updates accept binary
 *   payload only via the `files` parameter, which is an array of objects
 *   pointing to a real file on disk. There is no way to pass raw bytes /
 *   strings directly. Same applies to reading: there is no API method
 *   returning resource bytes; we must read the file at joplin.data.resourcePath().
 *
 * Workaround: we materialize the SVG string into a temp file inside the
 * plugin's own dataDir (joplin.plugins.dataDir()), pass it to the API,
 * and unlink afterwards. This stays sandboxed and survives across
 * platforms (Joplin guarantees dataDir is writable).
 */

import joplin from 'api';
import { promises as fs } from 'fs';
import * as path from 'path';

const SVG_MIME = 'image/svg+xml';
const SVG_EXT = 'svg';

/** Lazily-initialized cache for the plugin data directory. */
let cachedDataDir: string | null = null;

async function getDataDir(): Promise<string> {
	if (cachedDataDir) return cachedDataDir;
	cachedDataDir = await joplin.plugins.dataDir();
	await fs.mkdir(cachedDataDir, { recursive: true });
	return cachedDataDir;
}

/**
 * Writes the SVG string into a unique temp file inside the plugin dataDir,
 * runs the action with that path, and removes the file no matter what.
 */
async function withTempSvgFile<T>(
	svg: string,
	action: (filePath: string) => Promise<T>,
): Promise<T> {
	const dir = await getDataDir();
	const fileName = `canvas-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${SVG_EXT}`;
	const filePath = path.join(dir, fileName);
	await fs.writeFile(filePath, svg, 'utf8');
	try {
		return await action(filePath);
	} finally {
		// Best-effort cleanup; never let unlink errors mask the real result.
		try { await fs.unlink(filePath); } catch { /* ignore */ }
	}
}

/**
 * Creates a new SVG resource from an in-memory string.
 * Returns the new resource id (as used in `:/<id>` markdown embeds).
 */
export async function createSvgResource(svg: string, title: string): Promise<string> {
	return withTempSvgFile(svg, async (filePath) => {
		const created: { id: string } = await joplin.data.post(
			['resources'],
			null,
			{ title, mime: SVG_MIME, filename: `${title}.${SVG_EXT}` },
			[{ path: filePath }],
		);
		if (!created || typeof created.id !== 'string' || !created.id) {
			throw new Error('Joplin did not return a resource id on create');
		}
		return created.id;
	});
}

/**
 * Replaces the file content of an existing SVG resource.
 * Metadata (title, mime) is preserved.
 */
export async function updateSvgResource(resourceId: string, svg: string): Promise<void> {
	if (!resourceId) throw new Error('updateSvgResource: resourceId is required');
	await withTempSvgFile(svg, async (filePath) => {
		await joplin.data.put(
			['resources', resourceId],
			null,
			null,
			[{ path: filePath }],
		);
	});
}

/**
 * Reads the SVG content of a resource as a UTF-8 string.
 *
 * Note: the Plugin API exposes only the on-disk path of the resource via
 * data.resourcePath(); we read it from there directly. This is the
 * documented way for binary/text resource access from a plugin.
 */
export async function readSvgResource(resourceId: string): Promise<string> {
	if (!resourceId) throw new Error('readSvgResource: resourceId is required');
	const filePath = await joplin.data.resourcePath(resourceId);
	return fs.readFile(filePath, 'utf8');
}
