import {test} from 'node:test';
import assert from 'node:assert/strict';
import {recipes,matches,suggestions,recipeBook,assess} from '../recipes.mjs';
test('specific foods are not confused with mentions or other preparations',()=>{
 assert.equal(matches('fish',{name:'Красная рыба в баночке'}),false);
 assert.equal(matches('mushrooms',{name:'Римская смесь',note:'шампиньоны'}),false);
 assert.equal(matches('beef',{name:'Фарш говяжий с луком'}),false);
 assert.equal(matches('onion',{name:'Лук зеленый'}),false);
 assert.equal(matches('pelmeni',{name:'Вареники с капустой'}),false);
});
test('each supported original food gets three to five relevant recipes',()=>{
 const names=['Говядина Пирзола','Говядина на кости','Фарш говяжий с луком','Полкурицы','Филе куриное','Крылья','Бедра куриные','Рыба целая','Креветки','Икра','Красная рыба в баночке','Филе морского окуня','Тмин','Розмарин','Римская смесь','Шампиньоны','Петрушка','Лук зеленый','Перец красный острый','Лук кубиком','Морковь кубиком','Лисички','Овощная Смесь для завтрака бондюэль','Картофель фри','Клубника с сахаром перетертая','Вишня','Манго перетертый','Голубцы ленивые','Вареники с капустой','Пелтмени пышка','Маргарин','Тесто слоенное дрожжевое','Роти','Сыр'];
 const stock=names.map(name=>({name}));
 for(const p of stock){const list=suggestions(p,stock);assert.ok(list.length>=3&&list.length<=5,p.name);assert.ok(list.every(r=>r.ingredients.some(i=>matches(i.key,p))),p.name);}
 assert.ok(suggestions({name:'Крылья'},stock).slice(0,3).every(r=>r.ingredients[0].key==='wings'));
});
test('book follows current inventory, search, and honest missing ingredients',()=>{
 assert.deepEqual(recipeBook([]),[]);
 assert.deepEqual(suggestions({name:'Неизвестный новый продукт'},[]),[]);
 const stock=[{name:'Креветки'}];const book=recipeBook(stock,'чеснок');assert.ok(book.length);assert.ok(book.every(r=>r.ingredients[0].key==='shrimp'));
 const r=assess(recipes.find(r=>r.id==='shrimp-garlic'),stock);assert.equal(r.available,1);assert.equal(r.missing,3);
 assert.equal(recipeBook(stock,'<script>').length,0);
 assert.equal(new Set(recipes.map(r=>r.id)).size,recipes.length);
});
