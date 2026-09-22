import { Combobox,MultiCombobox } from './combobox.js';
import { validateFields } from './lib/catalog.js';
import { prepareImage } from './renderer.js';
const $=id=>document.getElementById(id);
let catalog,boxes={},reference=null,generated=null,busy=false,revision=0,imageJob=0,imageController=null,aiEnabled=false;
function status(id,text,tone=''){$(id).textContent=text;$(id).className='status '+tone;}
function fields(){return {category:boxes.category?.value||'',model:[...(boxes.model?.values||[])],condition:[...(boxes.condition?.values||[])],location:[...(boxes.location?.values||[])],whatsapp:$('whatsapp').value.trim(),email:$('email').value.trim(),additional:$('additional').value.trim()};}
function modelSignature(){return (boxes.model?.values||[]).join('\u241F');}
function markChanged(){revision++;$('downloadFlyer').disabled=true;$('outputReviewRow').hidden=true;$('outputConfirmed').checked=false;if(generated){$('previewBadge').textContent='UPDATE REQUIRED';$('previewBadge').className='badge stale';$('previewImage').classList.add('stale');}status('formStatus','');update();}
function clearReference(){
  imageJob++;imageController?.abort();imageController=null;reference=null;$('upload').value='';$('referenceImage').removeAttribute('src');$('imageReview').hidden=true;$('confirmRow').hidden=true;$('imageConfirmed').checked=false;
  const count=boxes.model?.values?.length||0;
  status('imageStatus',count===0?'Choose one or more models to add a product reference.':count===1?'Find or upload an exact image for this model.':'Upload one verified lineup/reference image that represents all selected models.');
  markChanged();
}
function update(){
  if(!catalog)return;
  const valid=Object.keys(validateFields(fields(),catalog)).length===0,models=boxes.model?.values||[];
  $('findImage').disabled=busy||models.length!==1;
  $('upload').disabled=busy||models.length<1;
  $('createFlyer').disabled=busy||!valid||!reference||reference.signature!==modelSignature()||!$('imageConfirmed').checked||!aiEnabled||!$('teamKey').value;
}
function showErrors(){const errors=validateFields(fields(),catalog);for(const id of ['category','model','condition','location','whatsapp','email','additional']){$(id+'Error').textContent=errors[id]||'';$(id).setAttribute('aria-invalid',String(Boolean(errors[id])));}return errors;}
async function api(url,options={}){const response=await fetch(url,options);let data;try{data=await response.json();}catch{throw new Error('The server returned an invalid response. Please try again.');}if(!response.ok)throw new Error(data.error||'The request failed. Please try again.');return data;}
async function acceptReference(image,name,source,job){
  const prepared=await prepareImage(image);if(job!==imageJob)return;
  reference={image:prepared,signature:modelSignature()};$('referenceImage').src=prepared;$('referenceName').textContent=name;$('sourceText').textContent=source?'Matched to the exact model section. Check the colors and variant.':'Uploaded reference. Confirm that it represents every selected model before generating.';
  $('sourceLink').hidden=!source;if(source)$('sourceLink').href=source;
  $('imageReview').hidden=false;$('confirmRow').hidden=false;$('imageConfirmed').checked=false;status('imageStatus','Review the product reference, then confirm it below.','success');markChanged();
}
async function findImage(){
  clearReference();const job=imageJob,model=boxes.model.values[0];imageController=new AbortController();$('findImage').disabled=true;status('imageStatus','Checking the exact model against the official source…');
  try{const result=await api('/api/product-image?model='+encodeURIComponent(model),{signal:imageController.signal});if(job!==imageJob)return;await acceptReference(result.image,result.matchedModel,result.source,job);}catch(error){if(job===imageJob&&error.name!=='AbortError')status('imageStatus',error.message,'error');}finally{if(job===imageJob){imageController=null;update();}}
}
async function uploadImage(){
  const file=$('upload').files?.[0];if(!file)return;
  imageJob++;imageController?.abort();const job=imageJob;reference=null;$('imageConfirmed').checked=false;$('imageReview').hidden=true;$('confirmRow').hidden=true;markChanged();
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)){status('imageStatus','Choose a PNG, JPEG or WebP file.','error');return;}
  if(file.size>10*1024*1024){status('imageStatus','The file is too large. Please use an image under 10 MB.','error');return;}
  const url=URL.createObjectURL(file);status('imageStatus','Preparing your reference image…');
  try{await acceptReference(url,file.name,null,job);}catch(error){if(job===imageJob)status('imageStatus',error.message,'error');}finally{URL.revokeObjectURL(url);update();}
}
function dataUrlToObjectUrl(dataUrl){
  const [head,payload]=dataUrl.split(',',2);const mime=head.match(/^data:([^;]+);base64$/)?.[1];if(!mime)throw new Error('The generated image format was invalid.');
  const binary=atob(payload);const bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes],{type:mime}));
}
async function create(e){
  e.preventDefault();if(busy)return;
  if(Object.keys(showErrors()).length){status('formStatus','Please check the highlighted fields.','error');return;}
  if(!reference||reference.signature!==modelSignature()||!$('imageConfirmed').checked){status('formStatus','Add and confirm the correct product reference first.','error');return;}
  if(!aiEnabled){status('formStatus','AI artwork generation is not connected on the server yet.','error');return;}
  if(!$('teamKey').value){status('formStatus','Enter the team access code.','error');return;}
  busy=true;$('editorFields').disabled=true;$('downloadFlyer').disabled=true;update();
  const snapshot=fields(),version=revision;$('createFlyer').firstElementChild.textContent='Generating artwork…';status('formStatus','Rebuilding the complete flyer as one new 1024 × 1536 artwork. This can take a little while.');
  try{
    const result=await api('/api/generate',{method:'POST',headers:{'Content-Type':'application/json','x-flyers-key':$('teamKey').value},body:JSON.stringify({fields:snapshot,image:reference.image,confirmed:true}),signal:AbortSignal.timeout(300000)});
    if(version!==revision)return;
    const url=dataUrlToObjectUrl(result.image);
    if(generated)URL.revokeObjectURL(generated.url);
    generated={url,revision:version,name:snapshot.model.join('-')};$('previewImage').src=url;$('previewImage').classList.remove('stale');$('previewImage').hidden=false;$('emptyPreview').hidden=true;$('previewBadge').textContent='REVIEW IMAGE';$('previewBadge').className='badge ready';$('outputReviewRow').hidden=false;$('outputConfirmed').checked=false;$('downloadFlyer').disabled=true;status('formStatus','Artwork generated. Review product accuracy and all text before enabling download.','success');
  }catch(error){status('formStatus',error.name==='TimeoutError'?'Generation timed out. Your details are preserved; please try again.':error.message,'error');}
  finally{busy=false;$('editorFields').disabled=false;$('createFlyer').firstElementChild.textContent='Create flyer';update();}
}
function updateModelHelp(){
  const count=boxes.model?.values?.length||0;
  const total=boxes.model?.options?.length||0;
  $('modelHelp').textContent=count?`${count} model${count===1?'':'s'} selected. Add more by typing or opening the list.`:`${total} models in this category. Type to filter, then select one or more.`;
}
async function boot(){
  try{
    catalog=await api('/catalog.json');
    boxes.model=new MultiCombobox($('model'),[],()=>{updateModelHelp();clearReference();},$('modelSelected'));boxes.model.setDisabled(true);
    boxes.category=new Combobox($('category'),catalog.categories,value=>{boxes.model.setOptions(catalog.models.filter(m=>m.category===value).map(m=>m.name));$('model').placeholder=value?'Search and add models':'Choose a category first';updateModelHelp();clearReference();});
    boxes.condition=new MultiCombobox($('condition'),catalog.conditions,markChanged,$('conditionSelected'));
    boxes.location=new MultiCombobox($('location'),catalog.locations,markChanged,$('locationSelected'));
    $('findImage').addEventListener('click',findImage);$('upload').addEventListener('change',uploadImage);$('removeImage').addEventListener('click',clearReference);$('flyerForm').addEventListener('submit',create);
    for(const id of ['whatsapp','email','additional','imageConfirmed','teamKey'])$(id).addEventListener('input',()=>{if(id==='additional')$('characterCount').textContent=`${$('additional').value.length} / 240`;if(['email','whatsapp'].includes(id))showErrors();markChanged();});
    $('outputConfirmed').addEventListener('change',()=>{$('downloadFlyer').disabled=!$('outputConfirmed').checked||!generated||generated.revision!==revision;});
    $('downloadFlyer').addEventListener('click',()=>{if(!generated||generated.revision!==revision||!$('outputConfirmed').checked)return;const a=document.createElement('a');a.href=generated.url;a.download=generated.name.replace(/[^a-z0-9]+/gi,'-').toLowerCase()+'-pcs.png';a.click();});
    updateModelHelp();update();
  }catch(error){$('bootError').hidden=false;$('bootError').textContent='The product catalog could not load. Reload the page. If this continues, contact the app administrator.';return;}
  try{const health=await api('/api/health');aiEnabled=health.aiEnabled;$('aiStatus').textContent=aiEnabled?'AI art mode is connected. The complete flyer is regenerated from your selected data and verified product reference.':'AI art mode needs server configuration before flyers can be generated.';$('teamKey').disabled=!aiEnabled;update();}catch{$('aiStatus').textContent='AI connection could not be checked.';$('teamKey').disabled=true;}
}
boot();
