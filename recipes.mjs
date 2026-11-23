import {catalog} from './recipe-catalog.mjs';
const normalize=value=>String(value||'').toLocaleLowerCase('ru').replaceAll('ё','е');
export const foodLabels={beefBone:'Говядина на кости',beefSmallBone:'Говядина с небольшой косточкой',beefSteak:'Говядина пирзола',mince:'Говяжий фарш',chickenHalf:'Половина курицы',chickenFillet:'Куриное филе',wings:'Куриные крылья',thighs:'Куриные бёдра',wholeFish:'Целая сырая рыба',salmon:'Сырая красная рыба',perch:'Филе морского окуня',shrimp:'Креветки',caviar:'Икра',cannedFish:'Готовая рыба в баночке',veg:'Овощная смесь',mushrooms:'Грибы',fries:'Картофель фри',berries:'Ягоды или ягодное пюре',mango:'Манговое пюре',cabbageRolls:'Ленивые голубцы',vareniki:'Вареники с капустой',pelmeni:'Пельмени',dough:'Слоёное тесто',roti:'Роти',margarine:'Маргарин',cheese:'Сыр',onion:'Репчатый лук',carrot:'Морковь',parsley:'Петрушка',greenOnion:'Зелёный лук',rosemary:'Розмарин',cumin:'Тмин',chili:'Острый перец'};
// Specific preparation and cut win over general words in a product name.
export function productKind(product){
 const n=normalize(product.name);
 if(/фарш/.test(n))return /говяж|говядин/.test(n)?'mince':null;
 if(/говядин|пирзола|пирозола/.test(n)){
  if(/пирзола|пирозола|стейк|отбивн/.test(n))return 'beefSteak';
  if(/маленьк.*кост|небольш.*кост/.test(n))return 'beefSmallBone';
  if(/на кости|с костью|ребр/.test(n))return 'beefBone';
  return null;
 }
 if(/крыл/.test(n))return 'wings';
 if(/бедр/.test(n))return 'thighs';
 if(/полкур|половин.*кур/.test(n))return 'chickenHalf';
 if(/филе.*кур|курин.*филе/.test(n))return 'chickenFillet';
 if(/икра/.test(n))return 'caviar';
 if(/рыба.*баноч/.test(n))return 'cannedFish';
 if(/кревет/.test(n))return 'shrimp';
 if(/рыба.*цел|цел.*рыба/.test(n))return 'wholeFish';
 if(/окун/.test(n))return 'perch';
 if(/красн.*рыб|лосос|семга|форель/.test(n))return 'salmon';
 if(/овощн.*смесь|смесь.*овощ|римская смесь|смесь для завтрака/.test(n))return 'veg';
 if(/^(шампиньон|лисичк|грибы)/.test(n))return 'mushrooms';
 if(/картофель фри/.test(n))return 'fries';
 if(/клубник|вишн|ягоды|ягодное пюре/.test(n))return 'berries';
 if(/манго/.test(n))return 'mango';
 if(/голубц/.test(n))return 'cabbageRolls';
 if(/вареники/.test(n))return 'vareniki';
 if(/пел[ьт]мени/.test(n))return 'pelmeni';
 if(/тесто сло|слоен.*тесто/.test(n))return 'dough';
 if(/роти/.test(n))return 'roti';
 if(/маргарин/.test(n))return 'margarine';
 if(/^сыр/.test(n))return 'cheese';
 for(const [key,re] of [['onion',/^лук (кубиком|репчатый)|^репчатый лук/],['carrot',/^морковь/],['parsley',/^петрушка/],['greenOnion',/^лук зелен|^зеленый лук/],['rosemary',/^розмарин/],['cumin',/^тмин/],['chili',/^перец.*остр|^острый перец/]])if(re.test(n))return key;
 return null;
}
export function matches(key,product){
 const kind=productKind(product);
 if(key==='beef')return ['beefBone','beefSmallBone','beefSteak'].includes(kind);
 if(key==='chicken')return ['chickenHalf','chickenFillet','wings','thighs'].includes(kind);
 if(key==='fish')return ['wholeFish','salmon','perch'].includes(kind);
 return kind!==null&&kind===key;
}
export const recipes=catalog.map(r=>{
 const merged=new Map();
 for(const [key,amount] of r.ingredients){const old=merged.get(key);if(old)old.amount+=` + ${amount}`;else merged.set(key,{key,label:foodLabels[key]||key,amount});}
 return {...r,ingredients:[...merged.values()]};
});
export const chapters=[...new Set(recipes.map(r=>r.chapter))];
export function assess(recipe,products){const ingredients=recipe.ingredients.map(i=>({...i,available:products.some(p=>matches(i.key,p))}));return {...recipe,ingredients,available:ingredients.filter(i=>i.available).length,missing:ingredients.filter(i=>!i.available).length};}
function ranked(items,products){return items.map(r=>assess(r,products)).sort((a,b)=>a.missing-b.missing||b.available-a.available||a.minutes-b.minutes||a.id.localeCompare(b.id));}
export function suggestions(product,products){
 const kind=productKind(product);if(!kind)return [];
 const primary=recipes.filter(r=>r.group===kind);
 // A herb is an ingredient, rather than a main course; cuts only get their own recipes.
 return ranked(primary.length?primary:recipes.filter(r=>r.ingredients.some(i=>i.key===kind)),products).slice(0,10);
}
export function recipeBook(products,query='',chapter='all'){
 const q=normalize(query).trim();
 return ranked(recipes.filter(r=>products.some(p=>matches(r.group,p))&&(chapter==='all'||r.chapter===chapter)&&normalize(`${r.title} ${r.ingredients.map(i=>i.label).join(' ')}`).includes(q)),products);
}
