// Serves the homepage search recordings with byte-range support (HTTP 206).
// Cloudflare Pages answers Range requests for static files with a full 200, and Safari on Mac and iPhone
// will not play an MP4 without ranges, so this reads the static file and returns only the bytes asked for.
const TYPES = { mp4: 'video/mp4', webp: 'image/webp' };

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const asset = await env.ASSETS.fetch(new Request(url.toString(), { headers: { 'Accept-Encoding': 'identity' } }));
  if (!asset.ok) return asset;
  const ext = url.pathname.split('.').pop().toLowerCase();
  const head = { 'Content-Type': TYPES[ext] || asset.headers.get('Content-Type') || 'application/octet-stream', 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=86400' };
  const range = request.headers.get('Range');
  if (!range) return new Response(asset.body, { status: 200, headers: head });
  const buf = await asset.arrayBuffer(), size = buf.byteLength;
  const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  let start, end;
  if (m && m[1] === '' && m[2] !== '') { start = Math.max(0, size - Number(m[2])); end = size - 1; }
  else if (m && m[1] !== '') { start = Number(m[1]); end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1); }
  if (!m || start > end || start >= size) return new Response(null, { status: 416, headers: { ...head, 'Content-Range': 'bytes */' + size } });
  return new Response(buf.slice(start, end + 1), { status: 206, headers: { ...head, 'Content-Range': 'bytes ' + start + '-' + end + '/' + size, 'Content-Length': String(end - start + 1) } });
}
