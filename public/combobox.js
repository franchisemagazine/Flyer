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
