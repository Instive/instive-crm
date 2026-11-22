import type {Contact,Activity} from './model.ts';
import {draftFor,linkedinProfile,needsLinkedinMessageReview,exportedLinkedinInvitation,verifiedLinkedinConnection,unansweredFollowUps} from './outreach.ts';

export type ResearchScope='assigned'|'buffer'|'contact';
const key=(name:string)=>name.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();

export function researchCandidates(contacts:Contact[],activities:Activity[],scope:ResearchScope,contactId?:string){
 const history=new Map<string,Activity[]>();
 for(const a of activities)history.set(a.contact_id,[...(history.get(a.contact_id)||[]),a]);
 const active=new Set(contacts.filter(c=>c.status!=='New'||c.next_date!==null).map(c=>key(c.company)).filter(Boolean));
 const chosen=contacts.filter(c=>{
  if(scope==='contact'?c.id!==contactId:scope==='buffer'?c.status!=='New'||c.next_date!==null:c.next_date===null)return false;
  if(!['New','Contacted','Replied','Interested'].includes(c.status)||!linkedinProfile(c)||!c.company.trim()||!c.name.trim()||!c.title.trim())return false;
  if(needsLinkedinMessageReview(c)||exportedLinkedinInvitation(c)&&!verifiedLinkedinConnection(c))return false;
  if(scope==='buffer'&&active.has(key(c.company)))return false;
  const h=history.get(c.id)||[];
  if(h.some(a=>['Opt-out','Not interested'].includes(a.kind))||unansweredFollowUps(h)>=2||draftFor(c,h).ready)return false;
  if(c.status==='New'&&h.some(a=>/sent|reply|meeting/i.test(a.kind)))return false;
  if(c.status!=='New'&&(!h.length||h.slice().sort((a,b)=>b.created_at.localeCompare(a.created_at))[0]?.kind==='Connection request sent'))return false;
  return true;
 });
 chosen.sort((a,b)=>(a.priority==='High'?0:a.priority==='Medium'?1:2)-(b.priority==='High'?0:b.priority==='Medium'?1:2)||
 (scope==='assigned'?(a.next_date||'').localeCompare(b.next_date||''):0)||a.name.localeCompare(b.name));
 const seen=new Set<string>();return chosen.filter(c=>{const company=key(c.company);if(scope!=='contact'&&seen.has(company))return false;seen.add(company);return true});
}
export function extractResearchReply(text:string,citations:unknown){
 const clean=(v:unknown,n:number)=>typeof v==='string'?v.replace(/\s+/g,' ').trim().slice(0,n):'';
 const raw=text.trim();
 let result:Record<string,unknown>;
 try{result=JSON.parse(raw)}catch{const i=raw.indexOf('{'),j=raw.lastIndexOf('}');if(i<0||j<=i)return null;try{result=JSON.parse(raw.slice(i,j+1))}catch{return null}}
 const source=clean(result.source,1500),insight=clean(result.insight,500),draft=clean(result.draft,750),connection=clean(result.connection,280);
 let uri:URL;try{uri=new URL(source);if(uri.protocol!=='https:'||!uri.hostname.includes('.'))return null}catch{return null}
 const citationsList=Array.isArray(citations)?citations:[];
 const urls=citationsList.map(x=>typeof x==='string'?x:x&&typeof x==='object'&&'url' in x?String(x.url):'').filter(Boolean);
 const normalized=urls.flatMap(v=>{try{return [new URL(v).href.replace(/\/$/,'')]}catch{return []}});
 if(!normalized.includes(uri.href.replace(/\/$/,'')))return null;
 if(insight.length<30||draft.length<60||!draft.includes('?')||/(\{\{|placeholder|lorem|example\.com)/i.test(draft+insight))return null;
 return {insight,source:uri.href,draft,connection};
}
