import { readFile } from 'node:fs/promises';
import { json,body,catalog } from '../lib/server.js';
import { validateFields } from '../lib/catalog.js';

const attempts = new Map(); // Per-instance abuse backstop; not a distributed quota.

function list(values){return values.join(' • ');}
function exactText(fields){
  const lines=[
    `PRODUCT MODEL${fields.model.length===1?'':'S'}: ${list(fields.model)}`,
    `CONDITION${fields.condition.length===1?'':'S'}: ${list(fields.condition)}`,
    `STOCK LOCATION${fields.location.length===1?'':'S'}: ${list(fields.location)}`,
  ];
  if(fields.additional)lines.push(`ADDITIONAL INFORMATION: ${fields.additional}`);
  if(fields.whatsapp)lines.push(`WHATSAPP: ${fields.whatsapp}`);
  if(fields.email)lines.push(`EMAIL: ${fields.email}`);
  return lines.join('\n');
}

export default async function handler(req,res) {
  if(req.method!=='POST')return json(res,405,{error:'Method not allowed.'});
  if (!process.env.OPENAI_API_KEY) return json(res,503,{error:'AI artwork generation is not connected. Configure the server API key first.'});
  const origin=req.headers.origin;
  if(origin){
    try{if(new URL(origin).host!==req.headers.host)return json(res,403,{error:'Invalid request origin.'});}
    catch{return json(res,403,{error:'Invalid request origin.'});}
  }
  const ip=String(req.headers['x-forwarded-for']||'unknown').split(',')[0];
  const times=(attempts.get(ip)||[]).filter(t=>Date.now()-t<60000);
  if(times.length>=3)return json(res,429,{error:'Please wait a minute before generating again.'});
  if(attempts.size>1000) attempts.clear(); times.push(Date.now());attempts.set(ip,times);

  let input;
  try{input=await body(req);if(!input || typeof input!=='object' || Array.isArray(input))throw new Error('Invalid body.');}catch{return json(res,400,{error:'Invalid or oversized request.'});}
  const errors=validateFields(input.fields||{},catalog);
  if(Object.keys(errors).length || input.confirmed!==true) return json(res,400,{error:'Choose valid product details and confirm the reference image.'});

  const match=String(input.image||'').match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/);
  if(!match || match[2].length>3_200_000)return json(res,400,{error:'Upload a PNG, JPEG, or WebP product image below 2.4 MB after resizing.'});
  const bytes=Buffer.from(match[2],'base64');
  const validSignature = (match[1]==='png' && bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) || (match[1]==='jpeg' && bytes[0]===255 && bytes[1]===216) || (match[1]==='webp' && bytes.toString('ascii',0,4)==='RIFF' && bytes.toString('ascii',8,12)==='WEBP');
  if(!validSignature)return json(res,400,{error:'Invalid image file.'});

  let brandData;
  try{brandData=(await readFile(new URL('../data/brand-template.txt',import.meta.url),'utf8')).trim();}catch{return json(res,500,{error:'Brand reference could not be loaded.'});}
  const brandMatch=brandData.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/);
  if(!brandMatch)return json(res,500,{error:'Brand reference is invalid.'});
  const brandBytes=Buffer.from(brandMatch[2],'base64');

  const form=new FormData();
  form.set('model',process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2.5-sunburst');
  form.set('size','1024x1536');form.set('quality','high');form.set('output_format','png');
  form.append('image[]',new Blob([bytes],{type:`image/${match[1]}`}),`product-reference.${match[1]}`);
  form.append('image[]',new Blob([brandBytes],{type:`image/${brandMatch[1]}`}),`brand-reference.${brandMatch[1]}`);

  const required=exactText(input.fields);
  form.set('prompt',`Act as a senior advertising art director and regenerate a COMPLETE PCS Wireless product flyer from scratch as one finished 1024 x 1536 portrait artwork.

IMAGE 1 is the verified product reference and is the source of truth for the physical product. Re-render the product naturally inside the new composition. Do NOT paste, frame, screenshot, or place the reference image as a rectangle. Preserve the exact generation, hardware shape, camera layout, ports, screen proportions, colors, and any lineup shown in the reference. Never substitute a similar model.

IMAGE 2 is a PCS Wireless brand/design reference. Use it only to learn the brand identity, visual language, logo treatment, premium blue/white/gold palette, spacing, and polished corporate advertising feel. Do NOT copy any old product, old condition text, old inventory claims, contact details, or other stale content visible in that reference.

Create a new premium commercial composition that looks intentionally art-directed: strong hierarchy, generous negative space, integrated product photography, realistic lighting and contact shadows, subtle depth, clean premium surfaces, restrained luminous blue atmosphere, and refined gold accents. The result must feel designed as a single piece of artwork, not like an image laid over a template.

The following text is the ONLY product/data copy allowed. Render it cleanly and accurately, using professional modern sans-serif typography. Do not invent prices, specs, claims, disclaimers, categories, people, accessories, or contact details. Do not repeat the same product name unnecessarily.

${required}

Mandatory layout intent:
- PCS Wireless branding must remain clear and premium.
- Product model information is the primary headline.
- Condition information is prominent but secondary.
- Stock locations must be easy to scan.
- Additional information appears only when supplied above.
- WhatsApp and email appear only when supplied above.
- Keep every essential text element comfortably inside safe margins.
- Keep the product fully visible and integrated into the scene.
- No mockup border, browser chrome, editor UI, watermark, or decorative placeholder text.
- Produce the complete final flyer, ready for review and download.`);

  try {
    const response=await fetch('https://api.openai.com/v1/images/edits',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`},body:form,signal:AbortSignal.timeout(280000)});
    const data=await response.json();
    if(!response.ok || !data.data?.[0]?.b64_json){
      const code=data.error?.code||'unknown';
      console.error('Image generation failed',{status:response.status,code});
      if(code==='credit_balance_exhausted')return json(res,402,{error:'OpenAI API credits are exhausted. Add credits in OpenAI API Billing, then try again. Your reference is preserved.'});
      if(code==='project_spend_limit_exceeded'||code==='organization_spend_limit_exceeded')return json(res,402,{error:'The OpenAI API spending limit has been reached. Increase the applicable project or organization limit, then try again. Your reference is preserved.'});
      if(code==='organization_usage_limit_exceeded')return json(res,429,{error:'The OpenAI organization usage limit has been reached. Review the OpenAI API Limits page, then try again. Your reference is preserved.'});
      return json(res,502,{error:'AI generation failed at OpenAI. Check API billing/model access or try again. Your reference is preserved.'});
    }
    json(res,200,{image:`data:image/png;base64,${data.data[0].b64_json}`,generated:true,reviewRequired:true,renderMode:'full-artwork'});
  } catch (error) {console.error('Image generation unavailable',{name:error.name});json(res,504,{error:'Image generation timed out. Your reference is preserved; try again.'});}
}
