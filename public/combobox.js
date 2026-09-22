import { filterOptions } from './lib/catalog.js';

export class Combobox {
  constructor(input, options, onChange) {
    this.input=input;this.root=input.parentElement;this.list=this.root.querySelector('[role=listbox]');this.toggle=this.root.querySelector('button');this.options=options;this.onChange=onChange;this.value='';this.active=-1;this.matches=[];
    input.addEventListener('focus',()=>this.open(false));
    input.addEventListener('input',()=>{if(this.value){this.value='';onChange('');}this.open(true);});
    input.addEventListener('keydown',e=>this.keydown(e));
    this.toggle.addEventListener('click',()=>{input.focus();this.open(false);});
    this.root.addEventListener('focusout',e=>{if(!this.root.contains(e.relatedTarget))this.close();});
    document.addEventListener('pointerdown',e=>{if(!this.root.contains(e.target))this.close();});
    this.list.addEventListener('pointerdown',e=>e.preventDefault());
    this.list.addEventListener('click',e=>{const item=e.target.closest('[role=option]');if(item)this.choose(item.dataset.value);});
    this.setDisabled(false);
  }
  setDisabled(disabled){this.input.disabled=disabled;this.toggle.disabled=disabled;if(disabled)this.close();}
  setOptions(options){this.options=options;this.value='';this.input.value='';this.close();this.setDisabled(!options.length);}
  open(filter=true){if(this.input.disabled)return;this.matches=filterOptions(this.options,filter?this.input.value:'');this.list.replaceChildren();this.active=-1;this.input.removeAttribute('aria-activedescendant');
    this.matches.forEach((value,i)=>{const li=document.createElement('li');li.id=`${this.input.id}Option${i}`;li.setAttribute('role','option');li.setAttribute('aria-selected','false');li.dataset.value=value;li.textContent=value;this.list.append(li);});
    if(!this.matches.length){const li=document.createElement('li');li.className='no-results';li.textContent='No matching options';this.list.append(li);}
    this.list.hidden=false;this.input.setAttribute('aria-expanded','true');
  }
  close(){this.list.hidden=true;this.input.setAttribute('aria-expanded','false');this.input.removeAttribute('aria-activedescendant');this.active=-1;}
  choose(value){if(!this.options.includes(value))return;this.value=value;this.input.value=value;this.close();this.onChange(value);}
  keydown(e){
    if(e.key==='Escape'){this.close();return;}
    if(e.key==='Tab'){this.close();return;}
    if(e.key==='Enter'&&!this.list.hidden){e.preventDefault();if(this.active>=0)this.choose(this.matches[this.active]);else if(this.matches.length===1)this.choose(this.matches[0]);return;}
    if(!['ArrowDown','ArrowUp'].includes(e.key))return;e.preventDefault();
    if(this.list.hidden)this.open(false);
    if(!this.matches.length)return;
    this.active=this.active<0?(e.key==='ArrowDown'?0:this.matches.length-1):(this.active+(e.key==='ArrowDown'?1:-1)+this.matches.length)%this.matches.length;
    [...this.list.children].forEach((li,i)=>li.setAttribute('aria-selected',String(i===this.active)));
    const selected=this.list.children[this.active];this.input.setAttribute('aria-activedescendant',selected.id);selected.scrollIntoView({block:'nearest'});
  }
}

export class MultiCombobox {
  constructor(input, options, onChange, chips) {
    this.input=input;this.root=input.parentElement;this.list=this.root.querySelector('[role=listbox]');this.toggle=this.root.querySelector('button');this.chips=chips;this.options=options;this.onChange=onChange;this.values=[];this.active=-1;this.matches=[];
    input.addEventListener('focus',()=>this.open(false));
    input.addEventListener('input',()=>this.open(true));
    input.addEventListener('keydown',e=>this.keydown(e));
    this.toggle.addEventListener('click',()=>{input.focus();this.open(false);});
    this.root.addEventListener('focusout',e=>{if(!this.root.contains(e.relatedTarget)&&!this.chips.contains(e.relatedTarget))this.close();});
    document.addEventListener('pointerdown',e=>{if(!this.root.contains(e.target)&&!this.chips.contains(e.target))this.close();});
    this.list.addEventListener('pointerdown',e=>e.preventDefault());
    this.list.addEventListener('click',e=>{const item=e.target.closest('[role=option]');if(item)this.choose(item.dataset.value);});
    this.chips.addEventListener('click',e=>{const button=e.target.closest('button[data-value]');if(button)this.remove(button.dataset.value);});
    this.setDisabled(false);this.renderChips();
  }
  setDisabled(disabled){this.input.disabled=disabled;this.toggle.disabled=disabled;if(disabled)this.close();}
  setOptions(options,{preserve=false}={}){this.options=options;if(!preserve)this.values=[];else this.values=this.values.filter(v=>options.includes(v));this.input.value='';this.renderChips();this.close();this.setDisabled(!options.length);}
  open(filter=true){if(this.input.disabled)return;const available=this.options.filter(v=>!this.values.includes(v));this.matches=filterOptions(available,filter?this.input.value:'');this.list.replaceChildren();this.active=-1;this.input.removeAttribute('aria-activedescendant');
    this.matches.forEach((value,i)=>{const li=document.createElement('li');li.id=`${this.input.id}Option${i}`;li.setAttribute('role','option');li.setAttribute('aria-selected','false');li.dataset.value=value;li.textContent=value;this.list.append(li);});
    if(!this.matches.length){const li=document.createElement('li');li.className='no-results';li.textContent=this.values.length===this.options.length?'All options selected':'No matching options';this.list.append(li);}
    this.list.hidden=false;this.input.setAttribute('aria-expanded','true');
  }
  close(){this.list.hidden=true;this.input.setAttribute('aria-expanded','false');this.input.removeAttribute('aria-activedescendant');this.active=-1;}
  choose(value){if(!this.options.includes(value)||this.values.includes(value))return;this.values.push(value);this.input.value='';this.renderChips();this.onChange([...this.values]);this.open(false);}
  remove(value){const next=this.values.filter(v=>v!==value);if(next.length===this.values.length)return;this.values=next;this.renderChips();this.onChange([...this.values]);this.input.focus();this.open(false);}
  renderChips(){this.chips.replaceChildren();for(const value of this.values){const chip=document.createElement('span');chip.className='selected-chip';const label=document.createElement('span');label.textContent=value;const remove=document.createElement('button');remove.type='button';remove.dataset.value=value;remove.setAttribute('aria-label',`Remove ${value}`);remove.textContent='×';chip.append(label,remove);this.chips.append(chip);}this.chips.hidden=!this.values.length;}
  keydown(e){
    if(e.key==='Backspace'&&!this.input.value&&this.values.length){e.preventDefault();this.remove(this.values[this.values.length-1]);return;}
    if(e.key==='Escape'){this.close();return;}
    if(e.key==='Tab'){this.close();return;}
    if(e.key==='Enter'&&!this.list.hidden){e.preventDefault();if(this.active>=0)this.choose(this.matches[this.active]);else if(this.matches.length===1)this.choose(this.matches[0]);return;}
    if(!['ArrowDown','ArrowUp'].includes(e.key))return;e.preventDefault();
    if(this.list.hidden)this.open(false);
    if(!this.matches.length)return;
    this.active=this.active<0?(e.key==='ArrowDown'?0:this.matches.length-1):(this.active+(e.key==='ArrowDown'?1:-1)+this.matches.length)%this.matches.length;
    [...this.list.children].forEach((li,i)=>li.setAttribute('aria-selected',String(i===this.active)));
    const selected=this.list.children[this.active];this.input.setAttribute('aria-activedescendant',selected.id);selected.scrollIntoView({block:'nearest'});
  }
}
