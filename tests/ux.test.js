import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Lifetime } from '../src/core/Lifetime.js';
class Node extends EventTarget {
 constructor(kind='button',action=''){super();this.kind=kind;this.dataset={action};this.offsetParent={};this.style={};this.attrs={};const classes=new Set(kind==='button'?['mi']:[]);this.classList={contains:c=>classes.has(c),add:c=>classes.add(c),remove:c=>classes.delete(c),toggle:(c,v)=>v?classes.add(c):classes.delete(c)};}
 matches(selector){return selector.split(',').some(s=>s.trim()===this.kind||s.trim()==='.pilot-entry input'&&this.kind==='input'||s.trim()==='[data-setting-step]'&&this.dataset.settingStep);}
 closest(){return this;}
 focus(){document.activeElement=this;}
 blur(){document.activeElement=null;}
 scrollIntoView(){}
 querySelector(){return null;}
 setAttribute(k,v){this.attrs[k]=v;}
 setSelectionRange(a,b){this.selectionStart=a;this.selectionEnd=b;}
}
globalThis.localStorage={getItem:()=>null,setItem(){}};globalThis.matchMedia=()=>({matches:false});
globalThis.window=new EventTarget();globalThis.document=Object.assign(new EventTarget(),{activeElement:null,getElementById:()=>null,querySelector:()=>null});globalThis.HTMLInputElement=class extends Node{constructor(){super('input');this.type='text';}};
const { Screens }=await import('../src/ui/Screens.js');const { HUD }=await import('../src/ui/HUD.js');
const { Input }=await import('../src/core/Input.js');const { Scores }=await import('../src/core/Settings.js');
function menu(){
 const items=[new Node('button','start'),new Node('button','settings'),new Node('button','scores')],actions=[];
 const root=new Node('div');root.querySelectorAll=()=>items;root.contains=n=>items.includes(n);
 const s=Object.create(Screens.prototype);Object.assign(s,{_lifetime:new Lifetime(),current:'title',stack:[],selIndex:0,_selection:new Map(),screens:new Map([['title',root]]),_act:a=>actions.push(a)});
 s._bindKeys();return {s,items,actions,root};
}
function key(code,target,shiftKey=false){const e=new Event('keydown',{cancelable:true});Object.defineProperty(e,'target',{value:target});Object.assign(e,{code,repeat:false,shiftKey});window.dispatchEvent(e);return e;}

test('Enter activates the actually focused button rather than stale selected item',()=>{
 const {s,items,actions}=menu();items[2].focus();key('Enter',items[2]);assert.deepEqual(actions,['scores']);assert.equal(s.selIndex,2);s.dispose();
});

test('Tab stays within the current menu and arrow selection moves real focus',()=>{
 const {s,items}=menu();document.activeElement=null;key('Tab',window,true);assert.equal(document.activeElement,items[2]);
 items[2].focus();key('Tab',items[2]);assert.equal(document.activeElement,items[0]);
 key('Tab',items[0],true);assert.equal(document.activeElement,items[2]);
 s.selIndex=0;s.handleControl('down');assert.equal(document.activeElement,items[1]);s.dispose();
});

test('P from nested settings returns to pause rather than resuming behind the menu',()=>{
 const {s,items,actions}=menu();s.current='settings';s.screens.set('settings',s.screens.get('title'));s.stack=['pause'];let destination;
 s.back=()=>{destination=s.stack.pop();};key('KeyP',items[0]);assert.equal(destination,'pause');assert.equal(actions.length,0);s.dispose();
});

test('hidden-screen pointer actions cannot activate the current menu',()=>{
 const {s,items,actions}=menu();s._bindPointer();const hidden=new Node('button','start');
 for(const target of [hidden,items[1]]){const e=new Event('click');Object.defineProperty(e,'target',{value:target});document.dispatchEvent(e);}
 assert.deepEqual(actions,['settings']);s.dispose();
});

test('controller edits all callsign positions and returns to retry navigation',()=>{
 const {s,actions}=menu(),field=new HTMLInputElement(),retry=new Node('button','retry');field.value='ACE';let saves=0;field.addEventListener('input',()=>saves++);
 s.current='over';s._items=()=>[field,retry];s.selIndex=0;s.handleControl('confirm');
 s.handleControl('up');s.handleControl('right');s.handleControl('down');s.handleControl('right');s.handleControl('up');
 assert.equal(field.value,'BBF');assert.equal(saves,3);s.handleControl('confirm');s.handleControl('down');s.handleControl('confirm');assert.deepEqual(actions,['retry']);s.dispose();
});

test('scores reject malformed rows, normalize fields and retain descending top ten',()=>{
 Scores.persistent=true;Scores._session=[];
 const bad=[null,'bad',{score:-1},{score:'90'},{score:50,name:'<x>',sector:'bad',time:-2},{score:100,name:'pilot',sector:4,time:20}];
 globalThis.localStorage={getItem:()=>JSON.stringify(bad),setItem(){}};
 const list=Scores.all();assert.equal(list.length,2);assert.equal(list[0].name,'PIL');assert.equal(list[0].score,100);assert.equal(list[1].sector,1);assert.equal(list[1].time,0);
 Scores.save(Array.from({length:20},(_,i)=>({score:i})));assert.equal(Scores._session.length,10);assert.equal(Scores._session[0].score,19);
});

test('blocked browser storage keeps scores and edited callsigns within the session',()=>{
 Scores.persistent=true;Scores._session=[];globalThis.localStorage={getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}};
 const entry={score:1200,name:'ACE',date:1};assert.equal(Scores.submit(entry),0);assert.equal(Scores.persistent,false);
 const list=Scores.all();list[0].name='JET';Scores.save(list);assert.equal(Scores.all()[0].name,'JET');assert.equal(Scores.best(),1200);
});

test('HUD live state exposes telemetry and enables touch only for active flight',()=>{
 const h=new HUD(),touch=new Node('div');h.root=new Node('div');const original=document.getElementById;document.getElementById=id=>id==='touch'?touch:null;
 h.setLive(true);assert.equal(h.root.attrs['aria-hidden'],'false');assert.equal(touch.inert,false);assert.equal(touch.classList.contains('is-live'),true);
 h.setControlsLive(false);assert.equal(touch.inert,true);assert.equal(touch.classList.contains('is-live'),false);
 h.setLive(false);assert.equal(h.root.attrs['aria-hidden'],'true');document.getElementById=original;
});

test('touch pause works even when no movement stick is present in the fixture',()=>{
 const pause=new Node('button'),original=document.getElementById;document.getElementById=id=>id==='tb-pause'?pause:null;
 const input=new Input(new EventTarget());let action;input.addEventListener('press',e=>action=e.detail);pause.dispatchEvent(new Event('click'));
 assert.equal(action,'pause');assert.equal(input.lastDevice,'touch');input.dispose();document.getElementById=original;
});


test('native settings Space remains available after both menu and flight input handlers',()=>{
 const {s,items}=menu();items[1].dataset.settingStep='-1';
 const input=new Input(window);const e=key('Space',items[1]);
 assert.equal(e.defaultPrevented,false);assert.equal(input.justPressed('fire'),false);
 input.dispose();s.dispose();
});
