import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { normalize } from './catalog.js';

export const SOURCE_PAGES = {
  iphone: 'https://support.apple.com/en-us/108044',
  ipad: 'https://support.apple.com/en-us/108043',
};

const decode = s => String(s)
  .replace(/&amp;/g,'&')
  .replace(/&#39;/g,"'")
  .replace(/&quot;/g,'"')
  .replace(/&nbsp;/g,' ')
  .replace(/&#x2F;/gi,'/');

export const headingKey = s => normalize(decode(s).replace(/<[^>]*>/g,'')).replace(/[^A-Z0-9]/g,'');

export function productIdentity(model) {
  let name = normalize(model);
  const aliases = {
    'IPHONE 6SP':'IPHONE 6S PLUS',
    'IPHONE 7P':'IPHONE 7 PLUS',
    'IPHONE 8P':'IPHONE 8 PLUS',
    'IPHONE XSM':'IPHONE XS MAX',
    'IPHONE SE2':'IPHONE SE (2ND GENERATION)',
    'IPHONE SE3':'IPHONE SE (3RD GENERATION)',
    'IPHONE SE':'IPHONE SE (1ST GENERATION)',
    'IPAD AIR2':'IPAD AIR 2',
    'IPAD AIR3':'IPAD AIR (3RD GENERATION)',
    'IPAD AIR4':'IPAD AIR (4TH GENERATION)',
    'IPAD AIR5':'IPAD AIR (5TH GENERATION)',
    'S938U':'SAMSUNG GALAXY S25 ULTRA (SM-S938U)',
  };
  name = aliases[name] || name;
  const ipad = name.match(/^IPAD (\d+)$/);
  if (ipad) name = `IPAD (${ipad[1]}${({1:'ST',2:'ND',3:'RD'}[ipad[1]] || 'TH')} GENERATION)`;
  const mini = name.match(/^IPAD MINI([3456])$/);
  if (mini) name = `IPAD MINI${Number(mini[1]) < 5 ? ' '+mini[1] : ' ('+mini[1]+'TH GENERATION)'}`;
  return {
    name,
    source: name.startsWith('IPHONE ') ? SOURCE_PAGES.iphone : name.startsWith('IPAD ') ? SOURCE_PAGES.ipad : null,
  };
}

export function brandHint(model) {
  const m=normalize(model);
  if (/^(IPHONE|IPAD|IMAC|MAC |MACBOOK|MBAIR|MBPRO|AIRPODS|APPLE WATCH|SERIES |SE\d? |ULTRA)/.test(m)) return 'Apple';
  if (/^(S\d{3}|A\d{3}|F\d{3}|G9\d{2}|N\d{3}|GALAXY )/.test(m)) return 'Samsung';
  if (/^PIXEL |^G(?:82U8|A0|A0B|HL1X|P4BC|QF4C|VU6C|011A|013C|020N)/.test(m)) return 'Google';
  if (/^XT\d{4}/.test(m)) return 'Motorola';
  if (/^(DE2117|DE2118|CPH\d{4})/.test(m)) return 'OnePlus';
  if (/^RMX\d{4}/.test(m)) return 'realme';
  if (/^SURFACE /.test(m)) return 'Microsoft';
  if (/^010-/.test(m)) return 'Garmin';
  if (/^FB\d{3}/.test(m)) return 'Fitbit';
  return '';
}

export function safeImageURL(value) {
  try {
    const u = new URL(decode(value));
    return u.protocol === 'https:' && !u.username && !u.password && !u.port &&
      ['cdsassets.apple.com','support.apple.com','help.apple.com','km.support.apple.com'].includes(u.hostname)
      ? u.href : null;
  } catch { return null; }
}

function privateIPv4(address){
  const p=address.split('.').map(Number);
  if(p.length!==4||p.some(n=>!Number.isInteger(n)||n<0||n>255))return true;
  return p[0]===0 || p[0]===10 || p[0]===127 || (p[0]===169&&p[1]===254) ||
    (p[0]===172&&p[1]>=16&&p[1]<=31) || (p[0]===192&&p[1]===168) ||
    (p[0]===100&&p[1]>=64&&p[1]<=127) || (p[0]===198&&(p[1]===18||p[1]===19)) ||
    p[0]>=224;
}
function privateIPv6(address){
  const a=address.toLowerCase();
  return a==='::1' || a==='::' || a.startsWith('fc') || a.startsWith('fd') || /^fe[89ab]/.test(a) ||
    a.startsWith('::ffff:127.') || a.startsWith('::ffff:10.') || a.startsWith('::ffff:192.168.');
}

export async function safePublicURL(value) {
  let u;
  try{u=new URL(decode(value));}catch{return null;}
  if(u.protocol!=='https:' || u.username || u.password || u.port || !u.hostname || u.hostname==='localhost' || u.hostname.endsWith('.local'))return null;
  if(isIP(u.hostname)){
    if((isIP(u.hostname)===4&&privateIPv4(u.hostname))||(isIP(u.hostname)===6&&privateIPv6(u.hostname)))return null;
    return u.href;
  }
  let records;
  try{records=await lookup(u.hostname,{all:true,verbatim:true});}catch{return null;}
  if(!records.length)return null;
  for(const record of records){
    if((record.family===4&&privateIPv4(record.address))||(record.family===6&&privateIPv6(record.address)))return null;
  }
  return u.href;
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

function attr(tag,name){
  const m=tag.match(new RegExp('\\b'+name+'\\s*=\\s*(["\\\'])([\\s\\S]*?)\\1','i'));
  return m?decode(m[2]):'';
}

export function extractWebImageCandidates(html){
  const out=[];
  for(const tag of html.matchAll(/<a\b[^>]*\bclass\s*=\s*(["'])[^"']*\biusc\b[^"']*\1[^>]*>/gi)){
    const raw=attr(tag[0],'m');
    if(!raw)continue;
    try{
      const data=JSON.parse(raw);
      if(data?.murl&&data?.purl)out.push({imageUrl:data.murl,pageUrl:data.purl,title:decode(data.t||data.desc||'')});
    }catch{}
  }
  return out;
}

export function extractWebPageCandidates(html){
  const out=[];
  for(const block of String(html).matchAll(/<li\b[^>]*class\s*=\s*(["'])[^"']*\bb_algo\b[^"']*\1[^>]*>([\s\S]*?)<\/li>/gi)){
    const a=block[2].match(/<a\b[^>]*href\s*=\s*(["'])(https:\/\/[^"']+)\1[^>]*>([\s\S]*?)<\/a>/i);
    if(!a)continue;
    out.push({pageUrl:decode(a[2]),title:decode(a[3].replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim()});
  }
  return out;
}

export function extractBingRssCandidates(xml){
  const out=[];
  for(const item of String(xml).matchAll(/<item>([\s\S]*?)<\/item>/gi)){
    const title=item[1].match(/<title>([\s\S]*?)<\/title>/i)?.[1]||'';
    const link=item[1].match(/<link>(https:\/\/[^<]+)<\/link>/i)?.[1]||'';
    if(!link)continue;
    out.push({pageUrl:decode(link.trim()),title:decode(title.replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim()});
  }
  return out;
}

function verificationKeys(model){
  const raw=headingKey(model), identity=headingKey(productIdentity(model).name);
  return [...new Set([raw,identity].filter(x=>x.length>=4))];
}

export function pageMatchesModel(html,model,context=''){
  const compact=headingKey((context||'')+' '+String(html).slice(0,2_500_000));
  return verificationKeys(model).some(key=>compact.includes(key));
}

export function sourceScore(pageUrl){
  let host='';
  try{host=new URL(pageUrl).hostname.toLowerCase();}catch{return 0;}
  const preferred=[
    'apple.com','samsung.com','google.com','store.google.com','motorola.com','microsoft.com',
    'oneplus.com','oppo.com','realme.com','mi.com','xiaomi.com','garmin.com','fitbit.com',
    'lenovo.com','asus.com','acer.com','hp.com','dell.com','sony.com','lg.com',
    'gsmarena.com','bestbuy.com','bhphotovideo.com','target.com','walmart.com'
  ];
  const i=preferred.findIndex(d=>host===d||host.endsWith('.'+d));
  return i<0?0:preferred.length-i;
}

export function findPageImage(html){
  for(const re of [
    /<meta\b[^>]*property\s*=\s*["']og:image["'][^>]*content\s*=\s*["']([^"']+)["'][^>]*>/i,
    /<meta\b[^>]*content\s*=\s*["']([^"']+)["'][^>]*property\s*=\s*["']og:image["'][^>]*>/i,
    /<meta\b[^>]*name\s*=\s*["']twitter:image["'][^>]*content\s*=\s*["']([^"']+)["'][^>]*>/i,
    /<meta\b[^>]*content\s*=\s*["']([^"']+)["'][^>]*name\s*=\s*["']twitter:image["'][^>]*>/i,
  ]){const m=String(html).match(re);if(m)return decode(m[1]);}
  return null;
}

export function findNamedPageImage(html,names=[]){
  const keys=names.map(headingKey).filter(x=>x.length>=4);
  for(const match of String(html).matchAll(/<img\b[^>]*>/gi)){
    const tag=match[0], alt=headingKey(attr(tag,'alt'));
    if(keys.length && !keys.some(key=>alt.includes(key)||key.includes(alt)))continue;
    const direct=attr(tag,'src')||attr(tag,'data-src')||attr(tag,'data-original');
    if(direct)return decode(direct);
    const srcset=attr(tag,'srcset')||attr(tag,'data-srcset');
    if(srcset){
      const first=srcset.split(',').map(x=>x.trim().split(/\s+/)[0]).filter(Boolean).pop();
      if(first)return decode(first);
    }
  }
  return null;
}

export async function findExactWebProductImage(model){
  const hint=brandHint(model);
  const query=[`"${model}"`,hint,'product'].filter(Boolean).join(' ');
  const searchUrl='https://www.bing.com/images/search?q='+encodeURIComponent(query)+'&form=HDRSC3';
  const search=await boundedFetch(searchUrl,{
    maxBytes:6_000_000,
    headers:{
      'user-agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/153 Safari/537.36',
      'accept-language':'en-US,en;q=0.9',
    },
    requirePublic:true,
  });
  if(!search.type.includes('text/html'))throw new Error('Web image search returned an invalid response.');
  let candidates=extractWebImageCandidates(search.bytes.toString('utf8'))
    .sort((a,b)=>sourceScore(b.pageUrl)-sourceScore(a.pageUrl))
    .slice(0,18);

  if(!candidates.length){
    const webSearchUrl='https://www.bing.com/search?q='+encodeURIComponent(query)+'&form=QBLH';
    const webSearch=await boundedFetch(webSearchUrl,{
      maxBytes:4_000_000,
      headers:{
        'user-agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/153 Safari/537.36',
        'accept-language':'en-US,en;q=0.9',
      },
      requirePublic:true,
    });
    if(webSearch.type.includes('text/html')){
      candidates=extractWebPageCandidates(webSearch.bytes.toString('utf8'))
        .sort((a,b)=>sourceScore(b.pageUrl)-sourceScore(a.pageUrl))
        .slice(0,18);
    }
  }

  if(!candidates.length){
    const rssQueries=[query,[\`"\${model}"\`,hint].filter(Boolean).join(' ')];
    for(const rssQuery of rssQueries){
      try{
        const rss=await boundedFetch('https://www.bing.com/search?format=rss&q='+encodeURIComponent(rssQuery),{
          maxBytes:2_000_000,
          headers:{'user-agent':'Mozilla/5.0 (compatible; PCS-Flyers/1.0)','accept-language':'en-US,en;q=0.9'},
          requirePublic:true,
        });
        const found=extractBingRssCandidates(rss.bytes.toString('utf8'));
        if(found.length){candidates=found.sort((a,b)=>sourceScore(b.pageUrl)-sourceScore(a.pageUrl)).slice(0,24);break;}
      }catch{}
    }
  }

  for(const candidate of candidates){
    const pageUrl=await safePublicURL(candidate.pageUrl);
    if(!pageUrl)continue;
    try{
      const page=await boundedFetch(pageUrl,{
        maxBytes:3_000_000,
        headers:{'user-agent':'Mozilla/5.0 (compatible; PCS-Flyers/1.0)'},
        requirePublic:true,
      });
      if(!page.type.includes('text/html'))continue;
      const html=page.bytes.toString('utf8');
      if(!pageMatchesModel(html,model,candidate.title+' '+candidate.pageUrl))continue;

      const preferredImage=findNamedPageImage(html,[model,productIdentity(model).name]);
      const socialImage=findPageImage(html);
      const imageOptions=[preferredImage,socialImage,candidate.imageUrl].filter(Boolean);
      for(const possible of imageOptions){
        let resolved=possible;
        try{resolved=new URL(possible,pageUrl).href;}catch{}
        const imageUrl=await safePublicURL(resolved);
        if(!imageUrl)continue;
        try{
          const file=await boundedFetch(imageUrl,{
            maxBytes:8_000_000,
            headers:{'user-agent':'Mozilla/5.0 (compatible; PCS-Flyers/1.0)','accept':'image/avif,image/webp,image/png,image/jpeg,image/*'},
            requirePublic:true,
          });
          if(!/^image\/(png|jpeg|webp)(?:;|$)/.test(file.type))continue;
          return {
            url:imageUrl,
            source:pageUrl,
            alt:productIdentity(model).name,
            matchedModel:productIdentity(model).name,
            image:`data:${file.type.split(';')[0]};base64,${file.bytes.toString('base64')}`,
            matchMethod:'verified-web-search',
          };
        }catch{}
      }
    }catch{}
  }
  return null;
}

export async function boundedFetch(url, options = {}) {
  const {maxBytes = 6_000_000, requirePublic=false, ...rest} = options;
  let target=url;
  if(requirePublic){
    target=await safePublicURL(url);
    if(!target)throw new Error('Unsafe or unavailable remote source.');
  }
  let response;
  for(let redirects=0;redirects<4;redirects++){
    response=await fetch(target,{...rest,redirect:'manual',signal:AbortSignal.timeout(20000)});
    const location=response.headers.get('location');
    if(response.status>=300&&response.status<400&&location){
      if(!requirePublic)throw new Error('Unexpected redirect from remote source.');
      let next;
      try{next=new URL(location,target).href;}catch{throw new Error('Invalid remote redirect.');}
      target=await safePublicURL(next);
      if(!target)throw new Error('Unsafe remote redirect.');
      continue;
    }
    break;
  }
  if (!response || !response.ok) throw new Error('The image source is unavailable. Upload the exact product image instead.');
  if (Number(response.headers.get('content-length') || 0) > maxBytes) throw new Error('Image source is too large.');
  const chunks = []; let total=0;
  for await (const chunk of response.body) {
    total += chunk.length;
    if (total > maxBytes) throw new Error('Image source is too large.');
    chunks.push(chunk);
  }
  return {bytes:Buffer.concat(chunks),type:response.headers.get('content-type') || '',url:target};
}
