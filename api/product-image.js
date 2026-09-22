import { catalog,json,query } from '../lib/server.js';
import {
  productIdentity,verifiedProductReference,findExactProductImage,findExactWebProductImage,findPageImage,findNamedPageImage,
  safePublicURL,pageMatchesModel,boundedFetch
} from '../lib/images.js';

const pages = new Map();

function responseText(data){
  for(const item of data?.output||[]){
    for(const part of item?.content||[]){
      if(part?.type==='output_text'&&part.text)return part.text;
    }
  }
  return data?.output_text||'';
}

function parseJson(text){
  const cleaned=String(text||'').trim().replace(/^\`\`\`(?:json)?\s*/i,'').replace(/\s*\`\`\`$/,'');
  try{return JSON.parse(cleaned);}catch{}
  const start=cleaned.indexOf('{'),end=cleaned.lastIndexOf('}');
  if(start>=0&&end>start){try{return JSON.parse(cleaned.slice(start,end+1));}catch{}}
  return null;
}

async function findViaOpenAI(model){
  if(!process.env.OPENAI_API_KEY)return {match:null,reason:'not_configured'};
  const prompt=`Find the exact consumer electronics product represented by the inventory model code/name "${model}".
Use web search. Prefer an official manufacturer product/support page; otherwise use a reputable retailer or product-reference page.
You MUST verify the exact model code/name, not a similar generation.
Return JSON only in this exact shape:
{"product_name":"...","matched_model":"...","source_url":"https://..."}
If you cannot verify the exact model, return {"product_name":null,"matched_model":null,"source_url":null}.`;

  const response=await fetch('https://api.openai.com/v1/responses',{
    method:'POST',
    headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},
    body:JSON.stringify({
      model:process.env.OPENAI_LOOKUP_MODEL||'gpt-5.6-luna',
      reasoning:{effort:'low'},
      tools:[{type:'web_search'}],
      input:prompt,
      max_output_tokens:300,
    }),
    signal:AbortSignal.timeout(45000),
  });
  const data=await response.json();
  if(!response.ok){
    const error=new Error('OpenAI product lookup failed.');
    error.code=data?.error?.code||'openai_lookup_failed';
    throw error;
  }
  const found=parseJson(responseText(data));
  if(!found?.source_url)return {match:null,reason:'not_found'};

  const pageUrl=await safePublicURL(found.source_url);
  if(!pageUrl)return {match:null,reason:'unsafe_source'};

  const page=await boundedFetch(pageUrl,{
    maxBytes:4_000_000,
    headers:{'user-agent':'Mozilla/5.0 (compatible; PCS-Flyers/1.0)','accept-language':'en-US,en;q=0.9'},
    requirePublic:true,
  });
  if(!page.type.includes('text/html'))return {match:null,reason:'not_html'};

  const html=page.bytes.toString('utf8');
  const context=[found.product_name,found.matched_model,pageUrl].filter(Boolean).join(' ');
  if(!pageMatchesModel(html,model,context))return {match:null,reason:'model_not_verified'};

  const candidates=[
    findNamedPageImage(html,[found.product_name,found.matched_model,model].filter(Boolean)),
    findPageImage(html),
  ].filter(Boolean);

  for(const candidate of candidates){
    const imageUrl=await safePublicURL(candidate);
    if(!imageUrl)continue;
    try{
      const file=await boundedFetch(imageUrl,{
        maxBytes:8_000_000,
        headers:{'user-agent':'Mozilla/5.0 (compatible; PCS-Flyers/1.0)','accept':'image/avif,image/webp,image/png,image/jpeg,image/*'},
        requirePublic:true,
      });
      if(!/^image\/(png|jpeg|webp)(?:;|$)/.test(file.type))continue;
      return {match:{
        url:imageUrl,
        source:pageUrl,
        alt:found.product_name||productIdentity(model).name,
        matchedModel:found.product_name||productIdentity(model).name,
        image:`data:${file.type.split(';')[0]};base64,${file.bytes.toString('base64')}`,
        matchMethod:'openai-verified-web-search',
      },reason:null};
    }catch{}
  }
  return {match:null,reason:'no_image'};
}

export default async function handler(req,res) {
  if(req.method!=='GET')return json(res,405,{error:'Method not allowed.'});
  const model = query(req).get('model');
  if (!catalog.models.some(m=>m.name===model)) return json(res,400,{error:'Choose a valid model first.'});

  const identity=productIdentity(model);
  const verified=verifiedProductReference(model);
  if(verified){
    try{
      const imageUrl=await safePublicURL(verified.image);
      if(imageUrl){
        const file=await boundedFetch(imageUrl,{
          maxBytes:8_000_000,
          headers:{'user-agent':'Mozilla/5.0 (compatible; PCS-Flyers/1.0)','accept':'image/avif,image/webp,image/png,image/jpeg,image/*'},
          requirePublic:true,
        });
        if(/^image\/(png|jpeg|webp)(?:;|$)/.test(file.type)){
          return json(res,200,{url:imageUrl,source:verified.source,alt:verified.name,matchedModel:verified.name,matchMethod:'verified-product-reference',image:`data:${file.type.split(';')[0]};base64,${file.bytes.toString('base64')}`});
        }
      }
    }catch(error){
      console.warn('Verified product image lookup failed',{model,message:error.message});
    }
  }


  // First choice: exact official Apple identification pages when available.
  if(identity.source){
    try {
      let cached=pages.get(identity.source);
      if (!cached || Date.now()-cached.at>3600000) {
        const p=await boundedFetch(identity.source,{maxBytes:2_000_000});
        if(!p.type.includes('text/html')) throw new Error('Image source returned an invalid page.');
        cached={at:Date.now(),html:p.bytes.toString('utf8')};pages.set(identity.source,cached);
      }
      const match=findExactProductImage(cached.html,model);
      if(match){
        const file=await boundedFetch(match.url);
        if(/^image\/(png|jpeg|webp)(?:;|$)/.test(file.type)){
          return json(res,200,{...match,source:identity.source,matchMethod:'official-exact-section',image:`data:${file.type.split(';')[0]};base64,${file.bytes.toString('base64')}`});
        }
      }
    }catch(error){
      console.warn('Official image lookup failed',{model,message:error.message});
    }
  }

  // Free web-search attempt first.
  try{
    const match=await findExactWebProductImage(model);
    if(match)return json(res,200,match);
  }catch(error){
    console.warn('Direct web image lookup failed',{model,message:error.message});
  }

  // Stronger fallback: use OpenAI web search to resolve an exact product page,
  // verify the model on that page, then import its image.
  try{
    const result=await findViaOpenAI(model);
    if(result.match)return json(res,200,result.match);
    return json(res,404,{error:'No exact product image could be verified automatically. Please upload the correct product image.'});
  }catch(error){
    console.error('OpenAI product lookup failed',{model,code:error.code||'unknown'});
    if(error.code==='credit_balance_exhausted')return json(res,402,{error:'Automatic web image lookup needs OpenAI API credits, and the current API credit balance is exhausted. Add API credits or upload the product image manually.'});
    if(error.code==='project_spend_limit_exceeded'||error.code==='organization_spend_limit_exceeded')return json(res,402,{error:'Automatic web image lookup is blocked by an OpenAI API spend limit. Increase the applicable limit or upload the product image manually.'});
    return json(res,502,{error:'Automatic image search could not verify an exact product image. Please upload the correct product image.'});
  }
}
