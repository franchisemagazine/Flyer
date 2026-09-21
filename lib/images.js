import { normalize } from './catalog.js';
export const SOURCE_PAGES = {
  iphone: 'https://support.apple.com/en-us/108044',
  ipad: 'https://support.apple.com/en-us/108043',
};
const decode = s => String(s).replace(/&amp;/g,'&').replace(/&#39;/g,"'").replace(/&quot;/g,'"').replace(/&nbsp;/g,' ');
export const headingKey = s => normalize(decode(s).replace(/<[^>]*>/g,'')).replace(/[^A-Z0-9]/g,'');

export function productIdentity(model) {
  let name = normalize(model);
  const aliases = { 'IPHONE 6SP':'IPHONE 6S PLUS', 'IPHONE 7P':'IPHONE 7 PLUS', 'IPHONE 8P':'IPHONE 8 PLUS', 'IPHONE XSM':'IPHONE XS MAX', 'IPHONE SE2':'IPHONE SE (2ND GENERATION)', 'IPHONE SE3':'IPHONE SE (3RD GENERATION)', 'IPHONE SE':'IPHONE SE (1ST GENERATION)', 'IPAD AIR2':'IPAD AIR 2','IPAD AIR3':'IPAD AIR (3RD GENERATION)','IPAD AIR4':'IPAD AIR (4TH GENERATION)','IPAD AIR5':'IPAD AIR (5TH GENERATION)' };
  name = aliases[name] || name;
  const ipad = name.match(/^IPAD (\d+)$/);
  if (ipad) name = `IPAD (${ipad[1]}${({1:'ST',2:'ND',3:'RD'}[ipad[1]] || 'TH')} GENERATION)`;
  const mini = name.match(/^IPAD MINI([3456])$/);
  if (mini) name = `IPAD MINI${Number(mini[1]) < 5 ? ' '+mini[1] : ' ('+mini[1]+'TH GENERATION)'}`;
  return { name, source: name.startsWith('IPHONE ') ? SOURCE_PAGES.iphone : name.startsWith('IPAD ') ? SOURCE_PAGES.ipad : null };
}

export function safeImageURL(value) {
  try {
    const u = new URL(decode(value));
    return u.protocol === 'https:' && !u.username && !u.password && !u.port && ['cdsassets.apple.com','support.apple.com','help.apple.com','km.support.apple.com'].includes(u.hostname) ? u.href : null;
  } catch { return null; }
}

// Only the image inside an exactly matching model heading is eligible.
// Never use a page-level social image, substring match, or a newer generation.
export function findExactProductImage(html, model) {
  const target = headingKey(productIdentity(model).name);
  const sections = [...html.matchAll(/<h([23])\b[^>]*>([\s\S]*?)<\/h\1>([\s\S]*?)(?=<h[23]\b|$)/gi)];
  for (const section of sections) {
    if (headingKey(section[2]) !== target) continue;
    for (const tag of section[3].matchAll(/<img\b[^>]*>/gi)) {
      const attrs = Object.fromEntries([...tag[0].matchAll(/([\w-]+)\s*=\s*["']([^"']*)["']/g)].map(m=>[m[1].toLowerCase(),m[2]]));
      const url = safeImageURL(attrs.src || attrs['data-src']);
      if (url) return {url, alt:decode(attrs.alt || productIdentity(model).name), matchedModel:productIdentity(model).name};
    }
  }
  return null;
}

export async function boundedFetch(url, options = {}) {
  const {maxBytes = 6_000_000, ...rest} = options;
  const response = await fetch(url, {...rest, redirect:'error', signal:AbortSignal.timeout(20000)});
  if (!response.ok) throw new Error('The image source is unavailable. Upload the exact product image instead.');
  if (Number(response.headers.get('content-length') || 0) > maxBytes) throw new Error('Image source is too large.');
  const chunks = []; let total=0;
  for await (const chunk of response.body) { total += chunk.length; if (total > maxBytes) throw new Error('Image source is too large.'); chunks.push(chunk); }
  return {bytes:Buffer.concat(chunks),type:response.headers.get('content-type') || ''};
}
