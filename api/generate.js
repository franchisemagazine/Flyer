import { readFile } from 'node:fs/promises';
import { json,body,catalog } from '../lib/server.js';
import { validateFields,modelDisplayName } from '../lib/catalog.js';

const attempts = new Map(); // Per-instance abuse backstop; not a distributed quota.
const MAX_REFERENCES=6;
const MAX_REFERENCE_PAYLOAD=3_000_000;

function list(values){return values.join(' • ');}
function exactText(fields){
  const models=fields.model.map(modelDisplayName);
  const lines=[
    `PRODUCT MODEL${models.length===1?'':'S'}: ${list(models)}`,
    `CONDITION${fields.condition.length===1?'':'S'}: ${list(fields.condition)}`,
    `STOCK LOCATION${fields.location.length===1?'':'S'}: ${list(fields.location)}`,
  ];
  if(fields.whatsapp)lines.push(`WHATSAPP: ${fields.whatsapp}`);
  if(fields.email)lines.push(`EMAIL: ${fields.email}`);
  return lines.join('\n');
}
function validSignature(type,bytes){
  return (type==='png' && bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) ||
    (type==='jpeg' && bytes[0]===255 && bytes[1]===216) ||
    (type==='webp' && bytes.toString('ascii',0,4)==='RIFF' && bytes.toString('ascii',8,12)==='WEBP');
}
export function parseReferenceInputs(input,fields){
  let raw=Array.isArray(input?.references)?input.references:null;
  if(!raw&&input?.image)raw=[{image:input.image,assignedModel:fields.model?.[0]||null}];
  if(!Array.isArray(raw)||raw.length<1||raw.length>MAX_REFERENCES)throw new Error(`Use between 1 and ${MAX_REFERENCES} product reference images.`);
  if(fields.model.length===1&&raw.length!==1)throw new Error('Use one product reference image when one model is selected.');
  let total=0;
  return raw.map((reference,index)=>{
    if(!reference||typeof reference!=='object'||Array.isArray(reference))throw new Error('Invalid product reference.');
    const assignedModel=reference.assignedModel||null;
    if(assignedModel!==null && (!fields.model.includes(assignedModel)||typeof assignedModel!=='string'))throw new Error('A reference image is assigned to a model that is not selected.');
    const match=String(reference.image||'').match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/);
    if(!match)throw new Error(`Reference image ${index+1} is not a valid PNG, JPEG, or WebP image.`);
    total+=match[2].length;
    if(total>MAX_REFERENCE_PAYLOAD)throw new Error('The combined product reference images are too large. Remove an image or upload smaller files.');
    const bytes=Buffer.from(match[2],'base64');
    if(!validSignature(match[1],bytes))throw new Error(`Reference image ${index+1} is invalid.`);
    return {type:match[1],bytes,assignedModel};
  });
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
  const errors=validateFields(input.fields||{},catalog,{allowCustom:true});
  if(Object.keys(errors).length || input.confirmed!==true) return json(res,400,{error:'Choose valid product details and confirm the reference images.'});

  let references;
  try{references=parseReferenceInputs(input,input.fields);}catch(error){return json(res,400,{error:error.message});}

  let brandData;
  try{brandData=(await readFile(new URL('../data/brand-template.txt',import.meta.url),'utf8')).trim();}catch{return json(res,500,{error:'Brand reference could not be loaded.'});}
  const brandMatch=brandData.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/);
  if(!brandMatch)return json(res,500,{error:'Brand reference is invalid.'});
  const brandBytes=Buffer.from(brandMatch[2],'base64');

  const form=new FormData();
  form.set('model',process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2.5-sunburst');
  form.set('size','1024x1536');form.set('quality','high');form.set('output_format','png');
  references.forEach((reference,index)=>{
    form.append('image[]',new Blob([reference.bytes],{type:`image/${reference.type}`}),`product-reference-${index+1}.${reference.type}`);
  });
  form.append('image[]',new Blob([brandBytes],{type:`image/${brandMatch[1]}`}),`brand-reference.${brandMatch[1]}`);

  const required=exactText(input.fields);
  const creativeDirection=String(input.fields.additional||'').trim();
  const templateImageNumber=references.length+1;
  const referenceMap=references.map((reference,index)=>{
    const role=reference.assignedModel?`verified reference for ${modelDisplayName(reference.assignedModel)}`:'general / lineup product reference';
    return `IMAGE ${index+1}: ${role}.`;
  }).join('\n');

  form.set('prompt',`Act as a senior advertising art director. Create the final PCS Wireless product flyer by EDITING within the supplied PCS template structure, not by inventing a new layout.

PRODUCT REFERENCE IMAGES:
${referenceMap}

The product reference images are the source of truth for physical products. When an image is assigned to a model, preserve that exact product identity and use that image only for that model. Never swap, merge, or confuse products between references. A general / lineup reference may guide the overall product group but must not override a specifically assigned model reference. Re-render products naturally inside the flyer; never paste any reference as a rectangular screenshot. Preserve hardware shape, camera layout, ports, screen proportions, colors, and visible generation details.

IMAGE ${templateImageNumber} is the AUTHORITATIVE PCS Wireless flyer template and layout blueprint. Follow it closely. Preserve the same overall composition, logo/header zone, primary headline zone, condition treatment, product-stage area, information hierarchy, location/contact treatment, footer structure, margins, proportions, whitespace and blue/white/gold brand language. You may polish lighting, depth, materials and the product scene, but DO NOT redesign the flyer into a different architecture.

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

The creative direction may influence product lighting, product angle, depth, subtle background treatment, emphasis and polish ONLY. If any creative request conflicts with IMAGE ${templateImageNumber}, the template wins. Do not move the logo, create a new header/footer system, add new sections, add slogans, or change the core template architecture.

Output requirements:
- Complete finished 1024 x 1536 portrait flyer.
- Represent all selected models clearly. Do not substitute a similar product.
- Product(s) fully visible and integrated with realistic lighting/contact shadows.
- Product model information is the primary headline.
- Condition information is prominent but secondary.
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
      if(code==='credit_balance_exhausted')return json(res,402,{error:'OpenAI API credits are exhausted. Add credits in OpenAI API Billing, then try again. Your references are preserved.'});
      if(code==='project_spend_limit_exceeded'||code==='organization_spend_limit_exceeded')return json(res,402,{error:'The OpenAI API spending limit has been reached. Increase the applicable project or organization limit, then try again. Your references are preserved.'});
      if(code==='organization_usage_limit_exceeded')return json(res,429,{error:'The OpenAI organization usage limit has been reached. Review the OpenAI API Limits page, then try again. Your references are preserved.'});
      return json(res,502,{error:'AI generation failed at OpenAI. Check API billing/model access or try again. Your references are preserved.'});
    }
    json(res,200,{image:`data:image/png;base64,${data.data[0].b64_json}`,generated:true,reviewRequired:true,renderMode:'full-artwork',referenceCount:references.length});
  } catch (error) {console.error('Image generation unavailable',{name:error.name});json(res,504,{error:'Image generation timed out. Your references are preserved; try again.'});}
}
