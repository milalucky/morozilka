import {test} from 'node:test';
import assert from 'node:assert/strict';
import {recipes,productKind,matches,suggestions,recipeBook,assess,foodLabels} from '../recipes.mjs';
const stock=Object.values(foodLabels).map(name=>({name}));
test('cuts, poultry parts and fish preparations stay separate',()=>{
 for(const [name,kind] of [['Говядина Пирзола','beefSteak'],['Говядина на кости','beefBone'],['Говядина с маленькой косточкой','beefSmallBone'],['Филе куриное','chickenFillet'],['Крылья','wings'],['Бёдра куриные','thighs'],['Рыба целая (похожа на красную)','wholeFish'],['Красная рыба в баночке','cannedFish']]){
  const p={name};assert.equal(productKind(p),kind);assert.ok(suggestions(p,stock).every(r=>r.group===kind),name);
 }
 assert.equal(matches('fish',{name:'Красная рыба в баночке'}),false);
 assert.equal(matches('mushrooms',{name:'Римская смесь',note:'шампиньоны'}),false);
 assert.equal(matches('onion',{name:'Лук зеленый'}),false);
 assert.equal(productKind({name:'Смесь пряностей'}),null);
 assert.equal(productKind({name:'Фарш куриный'}),null);
 assert.equal(productKind({name:'Говядина, неизвестный отруб'}),null);
});
test('every supported product has ten recipes, and bone beef gets soups and slow cooking',()=>{
 for(const p of stock){const items=suggestions(p,stock);assert.equal(items.length,10,p.name);assert.ok(items.every(r=>r.ingredients.some(i=>matches(i.key,p))),p.name);}
 const bone=suggestions({name:'Говядина на кости'},stock);assert.ok(bone.some(r=>/суп|борщ/.test(r.title)));assert.ok(bone.every(r=>r.minutes>=140));
 const steak=suggestions({name:'Говядина Пирзола'},stock);assert.ok(steak.every(r=>r.minutes<90));assert.ok(steak.every(r=>r.ingredients.some(i=>/Картофель|Макароны|Рис|Гречка|Булгур|Кускус|Чечевица|Фасоль|veg/.test(i.key))));
});
test('book follows current stock, sections and search without inventing pantry stock',()=>{
 assert.deepEqual(recipeBook([]),[]);assert.deepEqual(suggestions({name:'Неизвестный продукт'},stock),[]);
 const p=[{name:'Говядина на кости'}];assert.equal(recipeBook(p).length,10);assert.deepEqual(recipeBook(p,'','Птица'),[]);
 const mash=recipeBook([{name:'Говядина Пирзола'}],'пюре')[0];assert.ok(mash);const assessed=assess(mash,[{name:'Говядина Пирзола'}]);assert.equal(assessed.ingredients.find(i=>i.key==='Картофель').available,false);
 assert.equal(assessed.ingredients[0].available,true);assert.equal(recipeBook(stock,'<script>').length,0);
 assert.ok(recipeBook(stock,'бёдра').length);assert.ok(recipeBook(stock,'бедра').length);
});
test('catalog entries are complete and independently addressable',()=>{
 assert.equal(recipes.length,260);assert.equal(new Set(recipes.map(r=>r.id)).size,recipes.length);
 for(const r of recipes){assert.ok(r.steps.length>=1&&r.steps.every(s=>typeof s==='string'&&s.length>30),r.id);assert.ok(r.ingredients.length>=2,r.id);assert.ok(r.ingredients.every(i=>i.label&&i.amount),r.id);assert.ok(r.image>=0&&r.image<16,r.id);}
});
