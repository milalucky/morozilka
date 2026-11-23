export const categories = [
{id:'meat',name:'Мясо',color:'#b96b63'},
{id:'poultry',name:'Птица',color:'#c59256'},
{id:'fish',name:'Рыба и морики',color:'#649baa'},
{id:'veg',name:'Овощи',color:'#71976b'},
{id:'herbs',name:'Травы и специи',color:'#54846d'},
{id:'mushrooms',name:'Грибы',color:'#a48262'},
{id:'fruit',name:'Ягоды и фрукты',color:'#b57493'},
{id:'prepared',name:'Полуфабрикаты',color:'#b39b65'},
{id:'baking',name:'Тесто и лепёшки',color:'#bc9c64'},
{id:'dairy',name:'Молочные продукты и жиры',color:'#b7a45e'},
{id:'other',name:'Другое',color:'#9b8caf'}
];
export function migrateCategory(product) {
if(product.category==='veg') {
if(/тмин|розмарин|петрушка|лук зел[её]ный/i.test(product.name))return {...product,category:'herbs'};
if(/шампиньоны|лисички/i.test(product.name))return {...product,category:'mushrooms'};
}
if(product.category==='other') {
if(/тесто|роти/i.test(product.name))return {...product,category:'baking'};
if(/маргарин|сыр/i.test(product.name))return {...product,category:'dairy'};
}
return product;
}
export function parseMeasurements(amount) {
const weight=amount.match(/(\d+(?:[,.]\d+)?)\s*(кг|г)/);
const count=amount.match(/(?:[·×]\s*)?(\d+)\s*(шт|уп|леп[её]ш)/);
const multiplier=amount.match(/×\s*(\d+)/);
return {weight:weight?String(Number(weight[1].replace(',','.'))*(multiplier?Number(multiplier[1]):1)):'',weightUnit:weight?.[2]||'г',quantity:count?.[1]||multiplier?.[1]||'',quantityUnit:count?.[2]==='уп'?'уп':'шт'};
}
export function formatMeasurements(p) {
const parts=[];
if(p.weight)parts.push(`${String(p.weight).replace('.',',')} ${p.weightUnit}`);
if(p.quantity)parts.push(`${p.quantity} ${p.quantityUnit}`);
return parts.join(' · ');
}
