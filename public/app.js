import { Combobox,MultiCombobox } from './combobox.js';
import { validateFields,mergeCustomOptions,normalize,modelDisplayName } from './lib/catalog.js';
import { prepareImage } from './renderer.js';
const $=id=>document.getElementById(id);
let catalog,boxes={},references=[],generated=null,busy=false,revision=0,imageJob=0,imageController=null,aiEnabled=false,nextReferenceId=1;
const LOCAL_CATALOG_KEY='pcs-flyer-custom-options-v1';
const MAX_REFERENCES=6;
const MAX_REFERENCE_PAYLOAD=2_900_000;

function status(id,text,tone=''){$(id).textContent=text;$(id).className='status '+tone;}
function fields(){return {category:boxes.category?.value||'',model:[...(boxes.model?.values||[])],condition:[...(boxes.condition?.values||[])],location:[...(boxes.location?.values||[])],whatsapp:$('whatsapp').value.trim(),email:$('email').value.trim(),additional:$('additional').value.trim()};}
function modelSignature(){return (boxes.model?.values||[]).join('\u241F');}
function referencesValid(){return references.length>0&&references.every(ref=>ref.signature===modelSignature());}
function totalReferencePayload(extra=[]){return [...references,...extra].reduce((total,ref)=>total+String(ref.image||'').length,0);}
function markChanged(){revision++;$('downloadFlyer').disabled=true;$('outputReviewRow').hidden=true;$('outputConfirmed').checked=false;if(generated){$('previewBadge').textContent='UPDATE REQUIRED';$('previewBadge').className='badge stale';$('previewImage').classList.add('stale');}status('formStatus','');update();}
function resetReferenceConfirmation(){$('imageConfirmed').checked=false;}
function emptyReferenceMessage(){
  const count=boxes.model?.values?.length||0;
  return count===0?'Choose one or more models to add a product reference.':count===1?'Find or upload an exact image for this model.':'Upload one or more product images and assign them to the matching models for best accuracy.';
}
function clearReferences(){
  imageJob++;imageController?.abort();imageController=null;references=[];$('upload').value='';resetReferenceConfirmation();renderReferenceGallery();status('imageStatus',emptyReferenceMessage());markChanged();
}
function renderReferenceGallery(){
  const gallery=$('referenceGallery');gallery.replaceChildren();
  const models=boxes.model?.values||[],multi=models.length>1;
  for(const ref of references){
    const card=document.createElement('article');card.className='reference-card';card.dataset.id=String(ref.id);
    const img=document.createElement('img');img.src=ref.image;img.alt=ref.assignedModel?modelDisplayName(ref.assignedModel):'Uploaded product reference';
    const name=document.createElement('strong');name.textContent=ref.name;
    const meta=document.createElement('p');meta.className='reference-meta';meta.textContent=ref.source?'Verified exact-source reference.':'Uploaded reference image.';
    card.append(img,name,meta);
    if(multi){
      const label=document.createElement('label');label.htmlFor=`referenceAssignment${ref.id}`;label.textContent='Assign to model';
      const select=document.createElement('select');select.id=`referenceAssignment${ref.id}`;
      const general=document.createElement('option');general.value='';general.textContent='General / lineup reference';select.append(general);
      for(const model of models){const option=document.createElement('option');option.value=model;option.textContent=modelDisplayName(model);select.append(option);}
      select.value=ref.assignedModel&&models.includes(ref.assignedModel)?ref.assignedModel:'';
      select.addEventListener('change',()=>{ref.assignedModel=select.value||null;resetReferenceConfirmation();markChanged();});
      card.append(label,select);
    }
    const actions=document.createElement('div');actions.className='reference-actions';
    if(ref.source){const link=document.createElement('a');link.href=ref.source;link.target='_blank';link.rel='noopener noreferrer';link.textContent='View source ↗';actions.append(link);}
    const remove=document.createElement('button');remove.type='button';remove.className='text-button';remove.textContent='Remove';remove.addEventListener('click',()=>removeReference(ref.id));actions.append(remove);
    card.append(actions);gallery.append(card);
  }
  gallery.hidden=!references.length;
  $('confirmRow').hidden=!references.length;
  $('referenceConfirmText').textContent=(boxes.model?.values?.length||0)>1
    ?'I confirm these reference images accurately represent the selected products and their assigned models.'
    :'I confirm this reference accurately represents the selected model, generation, and color.';
}
function removeReference(id){
  const next=references.filter(ref=>ref.id!==id);if(next.length===references.length)return;
  references=next;resetReferenceConfirmation();renderReferenceGallery();status('imageStatus',references.length?`${references.length} reference image${references.length===1?'':'s'} ready for review.`:emptyReferenceMessage(),references.length?'success':'');markChanged();
}
function update(){
  if(!catalog)return;
  const valid=Object.keys(validateFields(fields(),catalog)).length===0,models=boxes.model?.values||[],multi=models.length>1;
  $('findImage').disabled=busy||models.length!==1;
  $('upload').disabled=busy||models.length<1||references.length>=MAX_REFERENCES;
  $('upload').multiple=multi;
  $('uploadLabelText').textContent=multi?'Upload images':'Upload reference';
  $('referenceHelp').textContent=multi
    ?'Multiple products selected. Upload up to 6 product images and assign each image to the matching model when possible. General lineup references are also allowed.'
    :'Find exact image checks the curated PCS library first, then verified manufacturer/reputable web sources. You can also upload one product reference.';
  $('createFlyer').disabled=busy||!valid||!referencesValid()||!$('imageConfirmed').checked||!aiEnabled;
}
function readLocalCustomOptions(){try{const rows=JSON.parse(localStorage.getItem(LOCAL_CATALOG_KEY)||'[]');return Array.isArray(rows)?rows:[];}catch{return [];}}
function addLocalCustom(kind,value){
  const normalized=normalize(value);
  if(kind==='model'){const category=boxes.category?.value||'';if(!catalog.models.some(item=>item.name===normalized&&item.category===category))catalog.models.push({name:normalized,category});}
  else if(kind==='condition'&&!catalog.conditions.includes(normalized))catalog.conditions.push(normalized);
  return normalized;
}
function saveCustom(kind,value){
  const normalized=addLocalCustom(kind,value),category=kind==='model'?(boxes.category?.value||''):'';
  const rows=readLocalCustomOptions();
  if(!rows.some(row=>row.kind===kind&&row.category_key===category&&row.value===normalized)){
    rows.push({kind,category_key:category,value:normalized});
    try{localStorage.setItem(LOCAL_CATALOG_KEY,JSON.stringify(rows));status('catalogStatus',`“${kind==='model'?modelDisplayName(normalized):normalized}” is saved on this browser.`,'success');}
    catch{status('catalogStatus','This browser could not save the new catalog value.','error');}
  }
}
function showErrors(){const errors=validateFields(fields(),catalog);for(const id of ['category','model','condition','location','whatsapp','email','additional']){$(id+'Error').textContent=errors[id]||'';$(id).setAttribute('aria-invalid',String(Boolean(errors[id])));}return errors;}
async function api(url,options={}){const response=await fetch(url,options);let data;try{data=await response.json();}catch{throw new Error('The server returned an invalid response. Please try again.');}if(!response.ok)throw new Error(data.error||'The request failed. Please try again.');return data;}
async function prepareReference(source,{name,sourceUrl=null,assignedModel=null,compact=false}={}){
  const image=await prepareImage(source,compact?{maxDimension:960,quality:.8,maxDataLength:430_000}:{maxDimension:1600,quality:.92,maxDataLength:2_900_000});
  return {id:nextReferenceId++,image,name:name||'Product reference',source:sourceUrl,assignedModel,signature:modelSignature()};
}
async function findImage(){
  clearReferences();const job=imageJob,model=boxes.model.values[0];imageController=new AbortController();$('findImage').disabled=true;status('imageStatus','Checking the curated PCS library and verified sources…');
  try{
    const result=await api('/api/product-image?model='+encodeURIComponent(model),{signal:imageController.signal});if(job!==imageJob)return;
    const ref=await prepareReference(result.image,{name:result.matchedModel||modelDisplayName(model),sourceUrl:result.source,assignedModel:model});
    if(job!==imageJob)return;references=[ref];resetReferenceConfirmation();renderReferenceGallery();status('imageStatus','Review the product reference, then confirm it below.','success');markChanged();
  }catch(error){if(job===imageJob&&error.name!=='AbortError')status('imageStatus',error.message,'error');}
  finally{if(job===imageJob){imageController=null;update();}}
}
async function uploadImages(){
  const files=[...($('upload').files||[])];if(!files.length)return;
  const models=boxes.model?.values||[],multi=models.length>1;
  if(!models.length){status('imageStatus','Choose one or more models first.','error');return;}
  if(!multi&&files.length>1){status('imageStatus','Upload one image when a single model is selected.','error');$('upload').value='';return;}
  const baseCount=multi?references.length:0;
  if(baseCount+files.length>MAX_REFERENCES){status('imageStatus',`You can use up to ${MAX_REFERENCES} reference images.`,'error');$('upload').value='';return;}
  for(const file of files){
    if(!['image/png','image/jpeg','image/webp'].includes(file.type)){status('imageStatus','Choose PNG, JPEG or WebP files only.','error');$('upload').value='';return;}
    if(file.size>10*1024*1024){status('imageStatus',`${file.name} is too large. Use images under 10 MB each.`,'error');$('upload').value='';return;}
  }
  if(!multi)clearReferences();else{imageJob++;imageController?.abort();imageController=null;resetReferenceConfirmation();}
  const job=imageJob;status('imageStatus',files.length===1?'Preparing your reference image…':`Preparing ${files.length} reference images…`);
  try{
    const prepared=[];
    for(const file of files){
      const url=URL.createObjectURL(file);
      try{prepared.push(await prepareReference(url,{name:file.name,assignedModel:multi?null:models[0],compact:multi}));}
      finally{URL.revokeObjectURL(url);}
      if(job!==imageJob)return;
    }
    if(totalReferencePayload(prepared)>MAX_REFERENCE_PAYLOAD){status('imageStatus','The combined reference images are too large. Remove an image or upload smaller files.','error');return;}
    references=multi?[...references,...prepared]:prepared;resetReferenceConfirmation();renderReferenceGallery();
    status('imageStatus',multi?`${references.length} reference image${references.length===1?'':'s'} ready. Assign images to models where possible, then confirm the set.`:'Review the product reference, then confirm it below.','success');markChanged();
  }catch(error){if(job===imageJob)status('imageStatus',error.message,'error');}
  finally{$('upload').value='';update();}
}
function dataUrlToObjectUrl(dataUrl){
  const [head,payload]=dataUrl.split(',',2);const mime=head.match(/^data:([^;]+);base64$/)?.[1];if(!mime)throw new Error('The generated image format was invalid.');
  const binary=atob(payload);const bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes],{type:mime}));
}
async function create(e){
  e.preventDefault();if(busy)return;
  if(Object.keys(showErrors()).length){status('formStatus','Please check the highlighted fields.','error');return;}
  if(!referencesValid()||!$('imageConfirmed').checked){status('formStatus','Add and confirm the correct product reference image set first.','error');return;}
  if(!aiEnabled){status('formStatus','AI artwork generation is not connected on the server yet.','error');return;}
  busy=true;$('editorFields').disabled=true;$('downloadFlyer').disabled=true;update();
  const snapshot=fields(),version=revision;$('createFlyer').firstElementChild.textContent='Generating artwork…';status('formStatus','Rebuilding the complete flyer as one new 1024 × 1536 artwork. This can take a little while.');
  try{
    const payload={fields:snapshot,references:references.map(ref=>({image:ref.image,assignedModel:ref.assignedModel})),confirmed:true};
    const result=await api('/api/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(300000)});
    if(version!==revision)return;
    const url=dataUrlToObjectUrl(result.image);
    if(generated)URL.revokeObjectURL(generated.url);
    generated={url,revision:version,name:snapshot.model.join('-')};$('previewImage').src=url;$('previewImage').classList.remove('stale');$('previewImage').hidden=false;$('emptyPreview').hidden=true;$('previewBadge').textContent='REVIEW IMAGE';$('previewBadge').className='badge ready';$('outputReviewRow').hidden=false;$('outputConfirmed').checked=false;$('downloadFlyer').disabled=true;status('formStatus','Artwork generated. Review product accuracy and all text before enabling download.','success');
  }catch(error){status('formStatus',error.name==='TimeoutError'?'Generation timed out. Your details and references are preserved; please try again.':error.message,'error');}
  finally{busy=false;$('editorFields').disabled=false;$('createFlyer').firstElementChild.textContent='Create flyer';update();}
}
function updateModelHelp(){
  const count=boxes.model?.values?.length||0,total=boxes.model?.options?.length||0;
  $('modelHelp').textContent=count?`${count} model${count===1?'':'s'} selected. Add more by typing or opening the list.`:`${total} models in this category. Type to filter, or enter a new model and choose Add.`;
}
async function boot(){
  try{
    catalog=await api('/catalog.json');catalog=mergeCustomOptions(catalog,readLocalCustomOptions());
    boxes.model=new MultiCombobox($('model'),[],()=>{updateModelHelp();clearReferences();},$('modelSelected'),value=>saveCustom('model',value),modelDisplayName);boxes.model.setDisabled(true);
    boxes.category=new Combobox($('category'),catalog.categories,value=>{boxes.model.setOptions(catalog.models.filter(m=>m.category===value).map(m=>m.name));$('model').placeholder=value?'Search or add models':'Choose a category first';updateModelHelp();clearReferences();});
    boxes.condition=new MultiCombobox($('condition'),catalog.conditions,markChanged,$('conditionSelected'),value=>saveCustom('condition',value));
    boxes.location=new MultiCombobox($('location'),catalog.locations,markChanged,$('locationSelected'));
    $('findImage').addEventListener('click',findImage);$('upload').addEventListener('change',uploadImages);$('flyerForm').addEventListener('submit',create);
    for(const id of ['whatsapp','email','additional','imageConfirmed'])$(id).addEventListener('input',()=>{if(id==='additional')$('characterCount').textContent=`${$('additional').value.length} / 240`;if(['email','whatsapp'].includes(id))showErrors();markChanged();});
    $('outputConfirmed').addEventListener('change',()=>{$('downloadFlyer').disabled=!$('outputConfirmed').checked||!generated||generated.revision!==revision;});
    $('downloadFlyer').addEventListener('click',()=>{if(!generated||generated.revision!==revision||!$('outputConfirmed').checked)return;const a=document.createElement('a');a.href=generated.url;a.download=generated.name.replace(/[^a-z0-9]+/gi,'-').toLowerCase()+'-pcs.png';a.click();});
    updateModelHelp();renderReferenceGallery();update();
  }catch(error){$('bootError').hidden=false;$('bootError').textContent='The product catalog could not load. Reload the page. If this continues, contact the app administrator.';return;}
  try{const health=await api('/api/health');aiEnabled=health.aiEnabled;$('aiStatus').textContent=aiEnabled?'AI art mode is connected. The complete flyer is regenerated from your selected data and verified product references.':'AI art mode needs server configuration before flyers can be generated.';update();}catch{$('aiStatus').textContent='AI connection could not be checked.';}
}
boot();
