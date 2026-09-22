import { catalog,json,query } from '../lib/server.js';
import { productIdentity,findExactProductImage,findExactWebProductImage,boundedFetch } from '../lib/images.js';

const pages = new Map();

export default async function handler(req,res) {
  if(req.method!=='GET')return json(res,405,{error:'Method not allowed.'});
  const model = query(req).get('model');
  if (!catalog.models.some(m=>m.name===model)) return json(res,400,{error:'Choose a valid model first.'});

  const identity=productIdentity(model);

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

  // Fallback: web image search. A candidate is accepted only after the model
  // name/code is verified on its source page, then the user must still confirm it.
  try{
    const match=await findExactWebProductImage(model);
    if(match)return json(res,200,match);
    return json(res,404,{error:'No exact web image could be verified for this model. Please upload the correct product image.'});
  }catch(error){
    console.error('Web image lookup failed',{model,message:error.message});
    return json(res,502,{error:'Automatic image search could not verify an exact product image. Please upload the correct product image.'});
  }
}
