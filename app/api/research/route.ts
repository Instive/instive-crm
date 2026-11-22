import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import type {Contact,Activity} from '../../../lib/model';
import {researchCandidates,extractResearchReply,type ResearchScope} from '../../../lib/research';
import {contactHistory,personalizedContext,verifiedLinkedinConnection} from '../../../lib/outreach';

export const runtime='nodejs';
export const maxDuration=60;
const WORKSPACE='98ceaaae-d8c8-4e81-aac1-62336675593e';
const result=(body:Record<string,unknown>,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}});
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());

export async function POST(req:NextRequest){
 const header=req.headers.get('Authorization')||'';
 if(!/^Bearer \S+$/.test(header))return result({error:'Sign in to Instive CRM first.'},401);
 const token=header.slice(7);
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL||process.env.SUPABASE_URL;
 const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||process.env.SUPABASE_ANON_KEY;
 if(!url||!key)return result({error:'CRM authentication is not configured.'},503);
 let body:{scope?:ResearchScope;contactId?:string;count?:number};
 try{body=await req.json()}catch{return result({error:'Invalid request.'},400)}
 if(!['assigned','buffer','contact'].includes(body.scope||''))return result({error:'Unknown research mode.'},400);
 const scope=body.scope!,count=scope==='contact'?1:Math.min(5,Math.max(1,Number(body.count)||5));
 if(scope==='contact'&&!/^[a-f0-9-]{36}$/i.test(body.contactId||''))return result({error:'Invalid contact identifier.'},400);
 const gateway=process.env.AI_GATEWAY_API_KEY||process.env.VERCEL_OIDC_TOKEN;
 if(!gateway)return result({error:'Web-grounded research is unavailable. Enable Vercel AI Gateway OIDC or configure a server-side AI_GATEWAY_API_KEY.'},503);
 // All database queries run with the signed-in user's JWT and workspace RLS. No service role.
 const db=createClient(url,key,{global:{headers:{Authorization:'Bearer '+token}},auth:{persistSession:false,autoRefreshToken:false}});
 const identity=await db.auth.getUser(token);
 if(identity.error||!identity.data.user)return result({error:'Your session expired. Sign in again.'},401);
 const [cr,ar]=await Promise.all([
  db.from('contacts').select('*').eq('workspace_id',WORKSPACE),
  db.from('activities').select('*').eq('workspace_id',WORKSPACE)
 ]);
 if(cr.error||ar.error)return result({error:'Cannot access this Instive workspace.'},403);
 const contacts=(cr.data||[]) as Contact[],activities=(ar.data||[]) as Activity[];
 if(!contacts.length)return result({error:'No accessible CRM contacts found.'},403);
 const date=today(),prepared=contacts.filter(c=>c.notes.includes('Personalized checked: '+date)).length;
 if(prepared>=60)return result({error:'Research preparation limit reached for today.'},429);
 const picks=researchCandidates(contacts,activities,scope,body.contactId).slice(0,Math.min(count,60-prepared));
 if(!picks.length)return result({saved:0,attempted:0,message:'No eligible prospects need fresh research in this selection.'});
 const outcomes=await Promise.all(picks.map(async c=>{
  const h=contactHistory(c,activities),latest=h[0];
  const recent=h.filter(a=>['First outreach sent','Follow-up sent','Reply received','Positive reply','Reply'].includes(a.kind)).slice(0,2);
  const context=recent.map(a=>a.kind+': '+a.notes.slice(0,300)).join(' | ').replace(/[\r\n]+/g,' ');
  const prompt='Research ONLY this person and company using independently verifiable PUBLIC web information. Name: '+c.name+'. Role: '+c.title+'. Company: '+c.company+'. LinkedIn: '+c.linkedin+'. CRM stage: '+c.status+'. Confirmed connected: '+(verifiedLinkedinConnection(c)?'yes':'not recorded')+'. Previous CRM messages: '+(context||'none')+'. Find an accurate specific company fact with a public citation. Create a short, natural first LinkedIn DM for a New contact; for existing replies, write a new context-aware follow-up without repeating the original. Ask one practical question. Do not invent operational problems, replies, launches, funding or recent news. Never pitch replacing existing tools. Return only a JSON object with exactly four string keys: insight, source, draft, connection. The source must be EXACTLY one URL in your search citations. If the company or an attributable fact cannot be verified, return all empty strings.';
  try{
   const rr=await fetch('https://ai-gateway.vercel.sh/v1/chat/completions',{method:'POST',
    headers:{'Content-Type':'application/json',Authorization:'Bearer '+gateway},
    body:JSON.stringify({model:'perplexity/sonar',temperature:0.1,max_tokens:650,
     messages:[{role:'system',content:'You create factual, specific B2B logistics networking messages based on web search, never fabricated signals. Respond using valid JSON only.'},{role:'user',content:prompt}]}),
    signal:AbortSignal.timeout(34000)});
   if(!rr.ok)return {name:c.name,ok:false,reason:rr.status===402?'AI Gateway credits unavailable':rr.status===401||rr.status===403?'AI Gateway authentication unavailable':'Research service error '+rr.status};
   const data=await rr.json() as {choices?:Array<{message?:{content?:string}}>;citations?:unknown[];search_results?:unknown[]};
   const found=extractResearchReply(data.choices?.[0]?.message?.content||'',data.citations?.length?data.citations:data.search_results||[]);
   if(!found)return {name:c.name,ok:false,reason:'No sufficiently verified public source or draft returned'};
   const fresh=await db.from('activities').select('id').eq('workspace_id',WORKSPACE).eq('contact_id',c.id).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(1);
   if(fresh.error||fresh.data?.[0]?.id!==(latest?.id||undefined))return {name:c.name,ok:false,reason:'Conversation changed during research'};
   const lines=['Personalized checked: '+date,'Personalized basis: '+(latest?.id||'none'),
    'Personalized status: '+c.status,'Personalized insight: '+found.insight,
    'Personalized source: '+found.source,'Personalized draft: '+found.draft];
   if(c.status==='New'&&found.connection)lines.push('Personalized connection: '+found.connection);
   let query=db.from('contacts').update({notes:[c.notes,...lines].filter(Boolean).join('\n')})
    .eq('workspace_id',WORKSPACE).eq('id',c.id).eq('status',c.status).eq('notes',c.notes);
   query=c.next_date===null?query.is('next_date',null):query.eq('next_date',c.next_date);
   const saved=await query.select('id').maybeSingle();
   if(saved.error||!saved.data)return {name:c.name,ok:false,reason:'Contact changed before save'};
   return {name:c.name,ok:true,source:found.source};
  }catch{return {name:c.name,ok:false,reason:'Research request timed out or was unavailable'}}
 }));
 const successes=outcomes.filter(x=>x.ok).length;
 return result({attempted:picks.length,saved:successes,skipped:outcomes.length-successes,results:outcomes,message:successes?successes+' researched messages saved. Verify the LinkedIn conversation before sending.':'No verified drafts were saved; see the reasons and retry another prospect.'});
}
