import { readFile } from 'node:fs/promises';
import { json,body,catalog } from '../lib/server.js';
import { validateFields,mergeCustomOptions } from '../lib/catalog.js';
import { loadCustomOptions } from '../lib/custom-options.js';

const attempts = new Map(); // Per-instance abuse backstop; not a distributed quota.

function list(values){return values.join(' • ');}
function exactText(fields){
  const lines=[
    `PRODUCT MODEL${fields.model.length===1?'':'S'}: ${list(fields.model)}`,
    `CONDITION${fields.condition.length===1?'':'S'}: ${list(fields.condition)}`,
    `STOCK LOCATION${fields.location.length===1?'':'S'}: ${list(fields.location)}`,
  ];
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
  const runtimeCatalog=mergeCustomOptions(catalog,await loadCustomOptions());
  const errors=validateFields(input.fields||{},runtimeCatalog);
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
  const creativeDirection=String(input.fields.additional||'').trim();
  form.set('prompt',`Act as a senior advertising art director. Create the final PCS Wireless product flyer by EDITING within the supplied PCS template structure, not by inventing a new layout.

IMAGE 1 is the verified product reference and is the source of truth for the physical product. Re-render the product naturally inside the product area. Preserve the exact generation, hardware shape, camera layout, ports, screen proportions, colors, and any lineup shown in the reference. Never substitute a similar model. Never paste the reference as a rectangular screenshot.

IMAGE 2 is the AUTHORITATIVE PCS Wireless flyer template and layout blueprint. Follow it closely. Preserve the same overall composition, logo/header zone, primary headline zone, condition treatment, product-stage area, information hierarchy, location/contact treatment, footer structure, margins, proportions, whitespace and blue/white/gold brand language. You may polish lighting, depth, materials and the product scene, but DO NOT redesign the flyer into a different architecture.

BRAND LOCK — NON-NEGOTIABLE:
- Keep the PCS Wireless logo treatment from the template.
- DO NOT add a company slogan, tagline, mission statement, sub-brand line or decorative sentence under the logo or anywhere else.
- Specifically do not generate phrases such as “Global Connections”, “A Brighter Tomorrow”, “Global Connections. A Brighter Tomorrow.”, or any other invented corporate copy.
- Do not invent prices, specs, claims, disclaimers, categories, people, accessories, contact details or promotional phrases.
- Only render text that appears in the approved data block below.

APPROVED DATA — this is the only copy that may appear in the flyer:

${required}

CREATIVE DIRECTION — instructions only; NEVER render this text verbatim on the flyer:
${creativeDirection || 'No extra creative direction. Stay very close to the template.'}

The creative direction may influence product lighting, product angle, depth, subtle background treatment, emphasis and polish ONLY. If any creative request conflicts with IMAGE 2, the template wins. Do not move the logo, create a new header/footer system, add new sections, add slogans, or change the core template architecture.

Output requirements:
- Complete finished 1024 x 1536 portrait flyer.
- Product fully visible and integrated with realistic lighting/contact shadows.
- Product model is the primary headline.
- Condition is prominent but secondary.
- Stock locations are easy to scan.
- WhatsApp and email appear only when supplied in the approved data.
- Keep essential text comfortably inside safe margins.
- No browser chrome, mockup border, editor UI, watermark, placeholder text or invented wording.
- Match the provided template as closely as possible while improving the product scene and overall finish.`);

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
