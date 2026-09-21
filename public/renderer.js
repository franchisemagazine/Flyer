export const FLYER_WIDTH=1024, FLYER_HEIGHT=1536;
export function fitFont(ctx,text,width,max=56,min=18,weight=700){let size=max;for(;size>min;size--){ctx.font=`${weight} ${size}px Arial`;if(ctx.measureText(text).width<=width)break;}ctx.font=`${weight} ${size}px Arial`;return size;}
export function wrapLines(ctx,text,width){
  const lines=[];let line='';
  for(const paragraph of String(text).split('\n')){
    for(const word of paragraph.split(/\s+/).filter(Boolean)){
      if(ctx.measureText(word).width>width){if(line){lines.push(line);line='';}let chunk='';for(const char of word){if(ctx.measureText(chunk+char).width>width){lines.push(chunk);chunk='';}chunk+=char;}line=chunk;}
      else if(line && ctx.measureText(line+' '+word).width>width){lines.push(line);line=word;}
      else line+=(line?' ':'')+word;
    }
    if(line){lines.push(line);line='';}
  }
  return lines;
}
function rounded(ctx,x,y,w,h,r,fill){ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fillStyle=fill;ctx.fill();}
function contain(ctx,img,x,y,w,h){const scale=Math.min(w/img.width,h/img.height);ctx.drawImage(img,x+(w-img.width*scale)/2,y+(h-img.height*scale)/2,img.width*scale,img.height*scale);}
export function drawFlyer(ctx,fields,product,brand,{ai=false}={}){
  const W=FLYER_WIDTH,H=FLYER_HEIGHT;
  ctx.clearRect(0,0,W,H);ctx.fillStyle='#ffffff';ctx.fillRect(0,0,W,H);
  // Reuse only the untouched brand strip. No stock text, old condition pill,
  // product, or contact details from the old template enter the new layout.
  ctx.drawImage(brand,0,0,brand.width,brand.height*0.163,0,0,W,250);
  ctx.fillStyle='#073b79';ctx.textAlign='center';
  let titleSize=56,lines=[];
  do{ctx.font=`900 ${titleSize}px Arial`;lines=wrapLines(ctx,fields.model,900);if(lines.length<=2)break;titleSize-=2;}while(titleSize>26);
  const titleY=lines.length===1?322:304;
  lines.forEach((line,i)=>ctx.fillText(line,512,titleY+i*(titleSize+8)));
  fitFont(ctx,fields.condition,750,36,22,800);
  const pillW=Math.min(840,Math.max(250,ctx.measureText(fields.condition).width+94));
  const gold=ctx.createLinearGradient(120,0,880,0);gold.addColorStop(0,'#ffaf14');gold.addColorStop(.5,'#ffcf56');gold.addColorStop(1,'#ffb31f');
  rounded(ctx,(W-pillW)/2,388,pillW,62,31,gold);ctx.fillStyle='#073b79';ctx.fillText(fields.condition,512,431);
  const hasInfo=Boolean(fields.additional.trim());
  const stage={x:66,y:480,w:892,h:hasInfo?595:742};
  if(!ai){const g=ctx.createRadialGradient(512,stage.y+stage.h-22,4,512,stage.y+stage.h-22,410);g.addColorStop(0,'rgba(22,87,145,.10)');g.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=g;ctx.fillRect(25,stage.y,974,stage.h+50);}
  contain(ctx,product,stage.x,stage.y,stage.w,stage.h);
  if(hasInfo){
    rounded(ctx,60,1104,904,150,18,'#f5f9fd');ctx.strokeStyle='#e1ebf5';ctx.lineWidth=1;ctx.stroke();
    const infoText=fields.additional.replace(/\s+/g,' ').trim();
    let size=26,info=[];do{ctx.font=`500 ${size}px Arial`;info=wrapLines(ctx,infoText,824);if(info.length*(size+8)<=122)break;size--;}while(size>12);
    ctx.fillStyle='#254b76';const lineHeight=size+8;const start=1178-(info.length-1)*lineHeight/2+size/3;
    info.forEach((line,i)=>ctx.fillText(line,512,start+i*lineHeight));
  }
  ctx.fillStyle='#0d4a91';fitFont(ctx,`Stock available — ${fields.location}`,864,31,20,700);ctx.fillText(`Stock available — ${fields.location}`,512,1320);
  ctx.strokeStyle='#ffc135';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(70,1352);ctx.lineTo(954,1352);ctx.stroke();
  const footer=ctx.createLinearGradient(0,1380,W,H);footer.addColorStop(0,'#074989');footer.addColorStop(1,'#052b67');ctx.fillStyle=footer;ctx.fillRect(0,1380,W,156);
  rounded(ctx,48,1420,283,69,16,'#ffc444');ctx.fillStyle='#073b79';ctx.textAlign='center';ctx.font='700 23px Arial';ctx.fillText('Contact us for pricing',189,1463);
  const contacts=[fields.whatsapp?{type:'whatsapp',text:fields.whatsapp}:null,fields.email?{type:'email',text:fields.email}:null].filter(Boolean);
  if(contacts.length){ctx.strokeStyle='#ffffff55';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(365,1411);ctx.lineTo(365,1505);ctx.stroke();}
  contacts.forEach((contact,i)=>{
    const y=contacts.length===1?1457:1431+i*55;
    ctx.strokeStyle='#fff';ctx.fillStyle='#fff';ctx.lineWidth=2.5;
    if(contact.type==='email'){ctx.strokeRect(400,y-13,30,22);ctx.beginPath();ctx.moveTo(400,y-13);ctx.lineTo(415,y-1);ctx.lineTo(430,y-13);ctx.stroke();}
    else{ctx.beginPath();ctx.arc(415,y-2,15,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.moveTo(404,y+9);ctx.lineTo(399,y+15);ctx.lineTo(410,y+11);ctx.stroke();ctx.save();ctx.translate(405,y-12);ctx.scale(.78,.78);ctx.beginPath();ctx.moveTo(5,1);ctx.lineTo(8,7);ctx.lineTo(5,10);ctx.quadraticCurveTo(8,17,16,20);ctx.lineTo(19,17);ctx.lineTo(25,20);ctx.quadraticCurveTo(23,27,16,24);ctx.quadraticCurveTo(2,18,1,8);ctx.quadraticCurveTo(0,3,5,1);ctx.fill();ctx.restore();}
    ctx.textAlign='left';const contactSize=fitFont(ctx,contact.text,521,26,12,600);
    const contactLines=wrapLines(ctx,contact.text,521);
    contactLines.forEach((line,j)=>ctx.fillText(line,450,y+7+(j-(contactLines.length-1)/2)*(contactSize+4)));
  });
  // Blank contact fields remain blank; there are no inherited default contacts.
  return {hasAdditionalInfo:hasInfo,contacts:contacts.map(c=>c.type),titleLines:lines.length};
}

export function loadImage(src){return new Promise((resolve,reject)=>{const image=new Image();const timer=setTimeout(()=>{image.src='';reject(new Error('The image took too long to load. Try a different file.'));},25000);image.onload=()=>{clearTimeout(timer);if(!image.width||!image.height)reject(new Error('Invalid image.'));else resolve(image);};image.onerror=()=>{clearTimeout(timer);reject(new Error('Could not decode the image. Use PNG, JPEG or WebP.'));};image.src=src;});}

export async function prepareImage(source){
  const image=await loadImage(source);
  if(image.width*image.height>60_000_000)throw new Error('Image dimensions are too large. Please upload a smaller version.');
  const scale=Math.min(1,1600/image.width,1600/image.height),canvas=document.createElement('canvas');canvas.width=Math.round(image.width*scale);canvas.height=Math.round(image.height*scale);
  const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
  return canvas.toDataURL('image/jpeg',.92);
}

export async function renderFlyer(fields,source,ai=false){
  const [product,brand]=await Promise.all([loadImage(source),loadImage('/assets/brand-template.webp')]);
  const canvas=document.createElement('canvas');canvas.width=FLYER_WIDTH;canvas.height=FLYER_HEIGHT;
  drawFlyer(canvas.getContext('2d'),fields,product,brand,{ai});
  const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('The PNG could not be exported.')),'image/png'));
  return {blob,url:URL.createObjectURL(blob)};
}
