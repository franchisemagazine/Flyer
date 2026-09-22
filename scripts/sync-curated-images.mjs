import { readFile, mkdir, writeFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const ROOT=new URL('../',import.meta.url);
const manifest=JSON.parse(await readFile(new URL('data/curated-images.json',ROOT),'utf8'));
const outDir=new URL('public/product-library/',ROOT);

function magicOk(bytes,mime){
  return (mime==='image/png'&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) ||
    (mime==='image/jpeg'&&bytes[0]===255&&bytes[1]===216) ||
    (mime==='image/webp'&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP');
}
async function download(entry){
  const urls=[
    `https://drive.usercontent.google.com/download?id=${encodeURIComponent(entry.driveFileId)}&export=download&confirm=t`,
    `https://drive.google.com/uc?export=download&id=${encodeURIComponent(entry.driveFileId)}`,
  ];
  let last;
  for(const url of urls){
    try{
      const response=await fetch(url,{redirect:'follow',headers:{'user-agent':'Mozilla/5.0 (compatible; PCS-Flyers/1.0)'},signal:AbortSignal.timeout(30000)});
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      const type=(response.headers.get('content-type')||'').split(';')[0].toLowerCase();
      if(type && !type.startsWith('image/'))throw new Error(`unexpected content type ${type}`);
      const bytes=Buffer.from(await response.arrayBuffer());
      if(bytes.length!==entry.size)throw new Error(`size mismatch ${bytes.length} != ${entry.size}`);
      if(!magicOk(bytes,entry.mime))throw new Error('image signature mismatch');
      const hash=createHash('sha256').update(bytes).digest('hex');
      if(hash!==entry.sha256)throw new Error('SHA-256 mismatch; Drive file changed and needs re-verification');
      return bytes;
    }catch(error){last=error;}
  }
  throw new Error(`Could not sync ${entry.file}: ${last?.message||'download failed'}`);
}

await rm(outDir,{recursive:true,force:true});
await mkdir(outDir,{recursive:true});
for(const entry of manifest.entries){
  const bytes=await download(entry);
  await writeFile(new URL(entry.file,outDir),bytes);
  console.log(`Synced ${entry.models.join(', ')} -> ${entry.file} (${bytes.length} bytes)`);
}
console.log(`Synced ${manifest.entries.length} curated PCS product images.`);
