import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCatalog,categoryFor,filterOptions,validateFields} from '../lib/catalog.js';
import {productIdentity,verifiedProductReference,findExactProductImage,safeImageURL,brandHint,extractWebImageCandidates,extractWebPageCandidates,extractBingRssCandidates,pageMatchesModel,sourceScore} from '../lib/images.js';
import health from '../api/health.js';
import generate from '../api/generate.js';
import imageHandler from '../api/product-image.js';
const catalog=createCatalog(JSON.parse(readFileSync(new URL('../data/catalog.json',import.meta.url))));
const valid={category:'Phones',model:['IPHONE 13'],condition:['NEW'],location:['Dubai'],whatsapp:'',email:'',additional:''};
function response(){return {headers:{},setHeader(k,v){this.headers[k]=v;},end(text){this.text=text;this.data=JSON.parse(text);}};}
test('all recovered models survive, with one whitespace-only duplicate consolidated',()=>{assert.equal(JSON.parse(readFileSync(new URL('../data/catalog.json',import.meta.url))).models.length,1448);assert.equal(catalog.models.length,1447);});
test('categories isolate phones and accessories',()=>{assert.equal(categoryFor('IPHONE 13'),'Phones');assert.equal(categoryFor('AIRPODS PRO'),'Accessories');assert.equal(categoryFor('PIXEL 6 CASE'),'Accessories');assert.equal(categoryFor('PIXEL WATCH 2 CHARGING CABLE'),'Accessories');assert.equal(categoryFor('IPAD 8'),'Tablets');assert.equal(categoryFor('S938U'),'Phones');assert.equal(categoryFor('MBPRO 13IN M22'),'Computers');assert.equal(categoryFor('GEFORCE RTX 3090'),'Components');assert.equal(categoryFor('AIRPORT EXPRESS'),'Data Devices');assert.equal(categoryFor('SERIES 9 AL 41MM'),'Wearables');});
test('ambiguous codes stay in Electronics until explicitly mapped',()=>{assert.equal(categoryFor('G82U8'),'Electronics');assert.equal(categoryFor('G82U8',{'G82U8':'Phones'}),'Phones');});
test('each model belongs to exactly one available category',()=>{for(const model of catalog.models)assert.ok(catalog.categories.includes(model.category));});
test('live dropdown search has no arbitrary result truncation',()=>{assert.equal(filterOptions(catalog.models.map(m=>m.name),'').length,1447);assert.ok(filterOptions(['IPHONE 13','IPHONE 13 PRO','IPAD 13'],'iphone prO').includes('IPHONE 13 PRO'));assert.deepEqual(filterOptions(['IPHONE 13','IPAD 8'],'not-in-catalog'),[]);});
test('location spelling duplicates are consolidated',()=>{assert.equal(catalog.locations.filter(x=>x==='Netherlands').length,1);assert.equal(catalog.locations.filter(x=>x==='United Kingdom').length,1);assert.ok(catalog.locations.includes('New Jersey'));});
test('form validation rejects cross-category and arbitrary typed values',()=>{assert.deepEqual(validateFields(valid,catalog),{});assert.ok(validateFields({...valid,category:'Accessories'},catalog).model);assert.ok(validateFields({...valid,model:['not a real model']},catalog).model);assert.ok(validateFields({...valid,condition:['banana']},catalog).condition);});
test('multi-select model, condition and location values validate',()=>{assert.deepEqual(validateFields({...valid,model:['IPHONE 13','IPHONE 13 PRO'],condition:['NEW','CPO'],location:['Dubai','New Jersey']},catalog),{});assert.ok(validateFields({...valid,model:['IPHONE 13','IPHONE 13']},catalog).model);});
test('contact fields are optional but validate when present',()=>{assert.deepEqual(validateFields({...valid,whatsapp:'+1 (973) 555-0123',email:'sales@example.com'},catalog),{});assert.ok(validateFields({...valid,email:'sales@'},catalog).email);assert.ok(validateFields({...valid,whatsapp:'not a phone'},catalog).whatsapp);assert.ok(validateFields({...valid,additional:'x'.repeat(241)},catalog).additional);});
test('image matcher never substitutes Pro or Pro Max for base model',()=>{const html='<h2>iPhone 13 Pro</h2><img src="https://cdsassets.apple.com/pro.png"><h2>iPhone 13</h2><img alt="iPhone 13" src="https://cdsassets.apple.com/base.png"><h2>iPhone 13 Pro Max</h2><img src="https://cdsassets.apple.com/max.png">';assert.equal(findExactProductImage(html,'IPHONE 13').url,'https://cdsassets.apple.com/base.png');assert.equal(findExactProductImage(html,'IPHONE 13 PRO MAX').url,'https://cdsassets.apple.com/max.png');assert.equal(findExactProductImage(html,'IPHONE 14'),null);});
test('generic social preview is never selected',()=>{assert.equal(findExactProductImage('<meta property="og:image" content="https://cdsassets.apple.com/random.png"><h2>iPhone 13</h2><p>Details</p>','IPHONE 13'),null);});
test('image sources reject SSRF and off-domain redirects',()=>{for(const url of ['http://cdsassets.apple.com/image.png','https://127.0.0.1/image.png','https://cdsassets.apple.com.evil.com/x','https://user:pass@cdsassets.apple.com/x','https://cdsassets.apple.com:444/x','data:image/png;base64,a'])assert.equal(safeImageURL(url),null);});
test('verified S938U fallback points to the exact Galaxy S25 Ultra source',()=>{
  const ref=verifiedProductReference('S938U');
  assert.equal(ref.name,'SAMSUNG GALAXY S25 ULTRA (SM-S938U)');
  assert.match(ref.source,/ebay\.com/);
  assert.match(ref.image,/ebayimg\.com/);
});
test('known generation aliases map exactly',()=>{assert.equal(productIdentity('IPHONE 8P').name,'IPHONE 8 PLUS');assert.equal(productIdentity('IPAD 8').name,'IPAD (8TH GENERATION)');assert.equal(productIdentity('IPHONE SE2').name,'IPHONE SE (2ND GENERATION)');assert.equal(productIdentity('S938U').name,'SAMSUNG GALAXY S25 ULTRA (SM-S938U)');assert.equal(productIdentity('S938U').source,null);});
test('health reports actual AI configuration, never secrets',()=>{const res=response();health({method:'GET'},res);assert.equal(res.statusCode,200);assert.equal(res.data.modelCount,1447);assert.equal(typeof res.data.aiEnabled,'boolean');assert.ok(!res.text.includes('sk-'));});
test('unconfigured AI returns setup failure rather than pretending to generate',async()=>{const saved=process.env.OPENAI_API_KEY;delete process.env.OPENAI_API_KEY;try{const res=response();await generate({method:'POST',headers:{}},res);assert.equal(res.statusCode,503);assert.match(res.data.error,/not connected/);}finally{if(saved)process.env.OPENAI_API_KEY=saved;}});
test('web image fallback extracts candidates and verifies exact model codes',()=>{
  const html='<a class="iusc" m="{&quot;murl&quot;:&quot;https://images.example.com/s938u.jpg&quot;,&quot;purl&quot;:&quot;https://www.samsung.com/us/s938u&quot;,&quot;t&quot;:&quot;Samsung SM-S938U Galaxy product&quot;}"></a>';
  const candidates=extractWebImageCandidates(html);
  assert.equal(candidates.length,1);
  assert.equal(candidates[0].pageUrl,'https://www.samsung.com/us/s938u');
  assert.equal(pageMatchesModel('<title>Samsung Galaxy SM-S938U</title>','S938U'),true);
  assert.equal(pageMatchesModel('<title>Samsung Galaxy S928U</title>','S938U'),false);
  assert.equal(brandHint('S938U'),'Samsung');
  assert.ok(sourceScore('https://www.samsung.com/us/s938u')>sourceScore('https://random.example/s938u'));
});
test('Bing RSS parser returns direct exact-model product pages',()=>{
  const xml='<rss><channel><item><title>Samsung Galaxy S25 Ultra SM-S938U</title><link>https://www.samsung.com/us/smartphones/galaxy-s25-ultra/example</link></item></channel></rss>';
  const candidates=extractBingRssCandidates(xml);
  assert.equal(candidates.length,1);
  assert.equal(candidates[0].pageUrl,'https://www.samsung.com/us/smartphones/galaxy-s25-ultra/example');
  assert.match(candidates[0].title,/S938U/);
});
test('regular web result parser finds product pages',()=>{
  const html='<li class="b_algo"><h2><a href="https://www.samsung.com/us/smartphones/galaxy-s25-ultra/buy/example">Galaxy S25 Ultra SM-S938U</a></h2></li>';
  const candidates=extractWebPageCandidates(html);
  assert.equal(candidates.length,1);
  assert.equal(candidates[0].pageUrl,'https://www.samsung.com/us/smartphones/galaxy-s25-ultra/buy/example');
});
test('invalid image model is rejected at the server',async()=>{const res=response();await imageHandler({method:'GET',url:'/api/product-image?model=https://localhost'},res);assert.equal(res.statusCode,400);});
test('malformed field types fail validation instead of throwing',()=>{for(const fields of [null,[],{...valid,model:'IPHONE 13'},{...valid,condition:123},{...valid,location:'Dubai'},{...valid,whatsapp:123},{...valid,additional:{text:'bad'}},{...valid,email:['bad']}])assert.ok(Object.keys(validateFields(fields,catalog)).length);});
test('AI rejects untrusted origins and malformed bodies before network calls',async()=>{
  const saved=process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY='test-only-placeholder';
  try{
    for(const origin of ['not a URL','https://other.example']){
      const res=response();await generate({method:'POST',headers:{host:'flyers.example',origin}},res);assert.equal(res.statusCode,403);
    }
    const res=response();await generate({method:'POST',headers:{host:'flyers.example'},body:null},res);assert.equal(res.statusCode,400);
  }finally{
    if(saved===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=saved;
  }
});
