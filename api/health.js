import { json, catalog } from '../lib/server.js';
export default function handler(req,res) {
  if(req.method!=='GET')return json(res,405,{error:'Method not allowed.'});
  json(res,200,{ok:true,version:'2.0.0',modelCount:catalog.models.length,aiEnabled:Boolean(process.env.OPENAI_API_KEY),imageMatching:'exact-model-heading',renderMode:'full-artwork'});
}
