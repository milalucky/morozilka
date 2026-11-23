import {test} from 'node:test';
import assert from 'node:assert/strict';
import {productData,categoryData,categoryId,validateImport,readLegacy} from '../model.mjs';
import {parseMeasurements,formatMeasurements,migrateCategory,categories} from '../data.mjs';
import {illustrationType} from '../illustrations.mjs';
const sample={id:'example',name:'Продукт',category:'meat',weight:'418',weightUnit:'г',quantity:'4',quantityUnit:'шт'};
test('weight and quantity remain independent and validate at the boundary',()=>{
  const p=productData(sample);assert.equal(p.weight,418);assert.equal(p.quantity,4);
  assert.equal(formatMeasurements(p),'418 г · 4 шт');
  assert.equal(productData({...sample,weight:''}).weight,null);
  assert.equal(productData({...sample,quantity:''}).quantity,null);
  for(const change of [{weight:'',quantity:''},{weight:'-1'},{quantity:'1.5'},{weight:'Infinity'},{weightUnit:'lb'},{quantity:'0'},{category:'bad/path'}])assert.throws(()=>productData({...sample,...change}));
});
test('legacy units, multipacks and split categories migrate without loss',()=>{
  assert.deepEqual(parseMeasurements('200 г × 2 уп'),{weight:'400',weightUnit:'г',quantity:'2',quantityUnit:'уп'});
  assert.equal(formatMeasurements(parseMeasurements('2 лепёшки')),'2 шт');
  assert.equal(formatMeasurements(parseMeasurements('3,3 кг')),'3,3 кг');
  assert.equal(migrateCategory({name:'Лисички',category:'veg'}).category,'mushrooms');
  const values={'zapas-concepts-v1':JSON.stringify([{id:'veg-1',name:'Петрушка',category:'veg',amount:'20 г'}])};
  const migrated=readLegacy({getItem:k=>values[k]||null});assert.equal(migrated.products[0].category,'herbs');assert.equal(migrated.products[0].id,'veg-1');
  assert.equal(readLegacy({getItem:()=>null}),null);
});
test('import rejects malformed references, duplicate IDs and invalid values',()=>{
  const valid={categories,products:[sample]};assert.equal(validateImport(valid).products[0].weight,418);
  assert.throws(()=>validateImport({...valid,products:[sample,sample]}));
  assert.throws(()=>validateImport({...valid,products:[{...sample,category:'unknown'}]}));
  assert.throws(()=>validateImport({...valid,products:[{...sample,id:'bad/path'}]}));
  assert.throws(()=>validateImport({...valid,categories:[categories[0],categories[0]]}));
});
test('categories have stable IDs without embedding document paths',()=>{
  assert.equal(categoryId(' Бульоны '),categoryId('бульоны'));
  assert(!categoryId('Травы / специи').includes('/'));
  assert.throws(()=>categoryData({name:' '}));
  assert.equal(categoryData({name:'Своё',color:'bad'}).color,'#7c9d90');
});
test('illustrations distinguish product types',()=>{
  assert.equal(illustrationType('Креветки'),'shrimp');assert.equal(illustrationType('Филе куриное'),'fillet');
  assert.notEqual(illustrationType('Говядина Пирзола'),illustrationType('Говядина на кости'));
  assert.notEqual(illustrationType('Фарш'),illustrationType('Филе куриное'));
});
