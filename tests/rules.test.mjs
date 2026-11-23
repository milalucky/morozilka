import {after,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment,assertSucceeds,assertFails} from '@firebase/rules-unit-testing';
import * as sdk from 'firebase/firestore';
import {createInventoryStore} from '../store.mjs';
import {categories} from '../data.mjs';
let env,db1,db2,outsider,unverified,anonymous,one,two;
const base={id:'test-product',name:'Тестовый продукт',category:'meat',weight:500,weightUnit:'г',quantity:2,quantityUnit:'шт',uncertain:false,note:''};
after(async()=>{await env?.cleanup();});
beforeEach(async()=>{
  await env?.cleanup();
  env=await initializeTestEnvironment({projectId:'demo-morozilka',firestore:{host:'127.0.0.1',port:8080,rules:await readFile('firestore.rules','utf8')}});
  await env.clearFirestore();
  db1=env.authenticatedContext('person-one',{email:'one@example.test',email_verified:true}).firestore();
  db2=env.authenticatedContext('person-two',{email:'two@example.test',email_verified:true}).firestore();
  outsider=env.authenticatedContext('outsider',{email:'other@example.test',email_verified:true}).firestore();
  unverified=env.authenticatedContext('unverified',{email:'one@example.test',email_verified:false}).firestore();
  anonymous=env.unauthenticatedContext().firestore();
  one=createInventoryStore(db1,sdk);two=createInventoryStore(db2,sdk);
  await env.withSecurityRulesDisabled(async context=>sdk.setDoc(sdk.doc(context.firestore(),'settings/access'),{emails:['one@example.test','two@example.test']}));
  await one.initialize();
});
test('both members share data; strangers, anonymous and unverified users cannot read or write',async()=>{
  await assertSucceeds(one.saveProduct(base));
  assert.equal((await sdk.getDoc(sdk.doc(db2,'freezers/home/products/test-product'))).data().name,base.name);
  for(const db of [outsider,anonymous,unverified]){
    await assertFails(sdk.getDoc(sdk.doc(db,'settings/access')));
    await assertFails(sdk.getDocs(sdk.collection(db,'freezers/home/products')));
    await assertFails(sdk.getDocs(sdk.collection(db,'freezers/home/categories')));
    await assertFails(createInventoryStore(db,sdk).saveProduct({...base,id:'blocked'}));
  }
  await assertFails(sdk.setDoc(sdk.doc(db1,'settings/access'),{emails:['other@example.test']}));
});
test('server rejects invalid data and forged revisions or timestamps',async()=>{
  await one.saveProduct(base);
  const ref=sdk.doc(db1,'freezers/home/products/test-product');
  for(const change of [{weight:-1},{quantity:1.5},{weight:null,quantity:null},{weightUnit:'lb'},{category:'missing'},{extra:'field'},{updatedAt:sdk.Timestamp.fromMillis(0)},{revision:99}]){
    await assertFails(sdk.updateDoc(ref,{revision:2,updatedAt:sdk.serverTimestamp(),...change}));
  }
});
test('independent product edits merge; concurrent edits to the same product conflict',async()=>{
  await one.saveProduct(base);await one.saveProduct({...base,id:'other-product'});
  await Promise.all([one.saveProduct({...base,weight:400},1),two.saveProduct({...base,id:'other-product',weight:300},1)]);
  assert.equal((await sdk.getDoc(sdk.doc(db2,'freezers/home/products/test-product'))).data().weight,400);
  const outcomes=await Promise.allSettled([one.saveProduct({...base,weight:200},2),two.saveProduct({...base,weight:100},2)]);
  assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);assert.equal(outcomes.filter(x=>x.status==='rejected').length,1);
  await assert.rejects(two.deleteProduct({...base,revision:1}));
});
test('shared snapshot listeners receive changes from the other device',async()=>{
  const update=new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{stop();reject(new Error('No live update'));},8000);
    const stop=sdk.onSnapshot(sdk.collection(db2,'freezers/home/products'),snapshot=>{if(snapshot.docs.some(d=>d.id===base.id)){clearTimeout(timer);stop();resolve();}},reject);
  });
  await one.saveProduct(base);await update;
});
test('initial import preserves existing edits, runs once and supports all initial categories',async()=>{
  await one.saveProduct({...base,weight:900});
  const products=categories.filter(c=>c.id!=='other').map((c,i)=>({...base,id:'import-'+i,category:c.id}));
  const count=await one.importInventory({categories,products:[base,...products]});
  assert.equal(count,products.length);
  assert.equal((await sdk.getDoc(sdk.doc(db1,'freezers/home/products/test-product'))).data().weight,900);
  await assert.rejects(two.importInventory({categories,products:[]}));
});
test('category creation is shared and concurrent duplicates do not overwrite',async()=>{
  const outcomes=await Promise.allSettled([one.addCategory({name:'Бульоны'}),two.addCategory({name:'бульоны'})]);
  assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);
  const id=outcomes.find(x=>x.status==='fulfilled').value;
  assert((await sdk.getDoc(sdk.doc(db2,'freezers/home/categories',id))).exists());
});
test('delete and undo cannot overwrite a newly created product',async()=>{
  await one.saveProduct(base);await one.deleteProduct({...base,revision:1});
  await two.saveProduct({...base,name:'Новая упаковка'});
  await assert.rejects(one.saveProduct(base));
  assert.equal((await sdk.getDoc(sdk.doc(db1,'freezers/home/products/test-product'))).data().name,'Новая упаковка');
});
test('revoking membership blocks subsequent reads and writes',async()=>{
  await one.saveProduct(base);
  await env.withSecurityRulesDisabled(context=>sdk.setDoc(sdk.doc(context.firestore(),'settings/access'),{emails:['one@example.test']}));
  await assertFails(two.saveProduct({...base,id:'revoked'}));
  await assertFails(sdk.getDocFromServer(sdk.doc(db2,'freezers/home/products/test-product')));
});
