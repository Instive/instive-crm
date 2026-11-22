import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blank,type Contact} from '../lib/model.ts';
import {researchCandidates,extractResearchReply} from '../lib/research.ts';
const lead=(name:string,notes='',status='New'):Contact=>({...blank,id:name,workspace_id:'w',name,company:name+' Freight',title:'CEO',linkedin:'https://www.linkedin.com/in/'+name,notes,status,priority:'High',next_date:null,created_at:''});
test('candidate queue excludes unknown DM histories and active companies',()=>{
 const pending=lead('Pending','LinkedIn opener history: NOT VERIFIED');
 const clean=lead('Clean','LinkedIn opener history: NOT VERIFIED\nLinkedIn opener review: no prior DM confirmed by user');
 const active={...lead('Active'),company:'Busy Freight',status:'Contacted'};
 const duplicate={...lead('Duplicate'),company:'Busy Freight'};
 assert.deepEqual(researchCandidates([pending,clean,active,duplicate],[],'buffer').map(c=>c.name),['Clean']);
});
test('drafts must cite a real URL returned by the search provider',()=>{
 const data=JSON.stringify({source:'https://company.com/about',insight:'The company runs cross-border transport and publishes monthly routing updates.',draft:'Hey Sam, I noticed you run cross-border freight services. Which manual routing exception tends to take the most time for dispatch?',connection:'Hi Sam, your transport experience stood out.'});
 assert.equal(extractResearchReply(data,['https://other.com/about']),null);
 assert.equal(extractResearchReply(data,['https://company.com/about'])?.source,'https://company.com/about');
 assert.equal(extractResearchReply(data.replace('https://company.com/about','javascript:alert(1)'),['https://company.com/about']),null);
});
