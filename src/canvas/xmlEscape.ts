/**
 * XML/SVG text-safety helpers shared by the serializer and the parser.
 */

/**
 * Strips characters that are illegal in XML 1.0 content. SVG renderers
 * (browsers, Inkscape, librsvg) reject the document otherwise.
 *
 * Allowed control chars in XML 1.0: \t (U+0009), \n (U+000A), \r (U+000D).
 * Everything else in U+0000..U+001F and U+007F..U+009F is removed.
 */
export function stripInvalidXmlChars(value: string): string {
	// eslint-disable-next-line no-control-regex
	return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '');
}

/** Escapes characters that are unsafe inside XML text/attribute values. */
export function escapeXml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
}

/** Reverses XML entity escaping for the five predefined entities. */
export function unescapeXml(value: string): string {
	return value
		.replace(/&apos;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&gt;/g, '>')
		.replace(/&lt;/g, '<')
		.replace(/&amp;/g, '&');
}

/**
 * Combined sanitizer for any user-provided string that ends up either as
 * XML attribute value or text node content. Removes invalid XML chars and
 * applies entity escaping.
 */
export function safeText(value: unknown): string {
	const str = typeof value === 'string' ? value : value == null ? '' : String(value);
	return escapeXml(stripInvalidXmlChars(str));
}

/**
 * Makes a JSON string safe to embed inside CDATA by neutralizing the
 * CDATA terminator. Reverse transformation lives in svgParser.
 */
export function escapeCdata(value: string): string {
	return value.split(']]>').join(']]]]><![CDATA[>');
}

/** Compact numeric formatter: integers as-is, others trimmed to 3 decimals. */
export function formatNumber(v: number): string {
	if (!Number.isFinite(v)) return '0';
	return Number.isInteger(v) ? String(v) : Number.parseFloat(v.toFixed(3)).toString();
}
