import {formatMeasurements} from './data.mjs';
import {illustration} from './illustrations.mjs';
import {firebaseConfig} from './firebase-config.mjs';
import {readLegacy,productData} from './model.mjs';
import {createCloud} from './cloud.mjs';
import {recipes,suggestions,recipeBook,assess,chapters} from './recipes.mjs';

const $=id=>document.getElementById(id);
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let products=[],categories=[],selected='all',query='',cloud,phase='loading',connected=false,syncState='offline',imported=false,editingOriginal=null,returnFocus,categoryFromEditor=false;
let toastTimer,wantsToOpen=false,detailProductId=null,bookRecipeId=null,bookProductId=null,contentsPage=0,bookItems=[];
function notify(message){$('toast').textContent=message;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),5000);}
function plural(n){return n%10===1&&n%100!==11?'упаковка':n%10>=2&&n%10<=4&&(n%100<12||n%100>14)?'упаковки':'упаковок';}
function errorMessage(error){
  const messages={
    'auth/popup-closed-by-user':'Вход отменён. Можно попробовать ещё раз.',
    'auth/cancelled-popup-request':'Завершите вход в открывшемся окне.',
    'auth/popup-blocked':'Браузер заблокировал окно входа. Разрешите всплывающие окна для этого сайта.',
    'auth/unauthorized-domain':'Адрес этого сайта ещё не разрешён в настройках Firebase.',
    'auth/network-request-failed':'Не удалось подключиться. Проверьте интернет.',
    'permission-denied':'Нет доступа к общей морозилке. Войдите под одним из двух разрешённых аккаунтов.',
    'unavailable':'Общая база временно недоступна. Изменение не подтверждено. Проверьте соединение и попробуйте снова.'
  };
  return messages[error?.code]||error?.message||'Не получилось сохранить изменение. Попробуйте ещё раз.';
}
function render(){
  $('allCount').textContent=products.length;
  if(selected!=='all'&&!categories.some(c=>c.id===selected))selected='all';
  $('viewTitle').textContent=selected==='all'?'Все продукты':categories.find(c=>c.id===selected).name;
  $('categories').innerHTML=`<button class="category ${selected==='all'?'selected':''}" data-category="all" aria-pressed="${selected==='all'}"><svg class="category-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" aria-hidden="true"><rect x="2" y="2" width="6" height="6" rx="1"/><rect x="12" y="2" width="6" height="6" rx="1"/><rect x="2" y="12" width="6" height="6" rx="1"/><rect x="12" y="12" width="6" height="6" rx="1"/></svg>Все запасы<span class="count">${products.length}</span></button>`+categories.map(c=>`<button class="category ${selected===c.id?'selected':''}" data-category="${escape(c.id)}" aria-pressed="${selected===c.id}"><span class="category-dot" style="--dot:${/^#[0-9a-f]{6}$/i.test(c.color)?c.color:'#7c9d90'}"></span>${escape(c.name)}<span class="count">${products.filter(p=>p.category===c.id).length}</span></button>`).join('');
  const visible=products.filter(p=>(selected==='all'||p.category===selected)&&`${p.name} ${p.note||''} ${formatMeasurements(p)}`.toLocaleLowerCase('ru').includes(query));
  $('shelves').innerHTML=categories.map(c=>{
    const items=visible.filter(p=>p.category===c.id);if(!items.length)return '';
    return `<section class="shelf"><div class="shelf-heading"><h2>${escape(c.name)}</h2><span>${items.length} ${plural(items.length)}</span></div><div class="products">${items.map(p=>`<button class="product" data-product="${escape(p.id)}" aria-label="${escape(p.name)}, ${escape(formatMeasurements(p))}. Рецепты и редактирование"><span class="package">${illustration(p)}<span class="package-label"><span class="product-name">${escape(p.name)}</span><span class="amount">${escape(formatMeasurements(p))}</span>${p.uncertain?'<span class="uncertain">Уточнить вес</span>':''}${p.note?`<span class="amount">${escape(p.note==='Домашние'||p.note==='Покупные'?p.note:'Овощная смесь')}</span>`:''}</span></span></button>`).join('')}</div></section>`;
  }).join('')||'<div class="empty">Здесь пока ничего нет.<br>Добавьте продукт или выберите другую категорию.<button class="text-button" id="clearFilters">Показать все запасы</button></div>';
  categoryOptions();
  renderRecipes();
  $('importPanel').hidden=imported||phase!=='ready';
}
function categoryOptions(value=$('productCategory').value){
  $('productCategory').innerHTML=categories.map(c=>`<option value="${escape(c.id)}">${escape(c.name)}</option>`).join('');
  if(categories.some(c=>c.id===value))$('productCategory').value=value;
}
function syncStatus(){
  const online=connected&&navigator.onLine;
  $('syncStatus').textContent=phase==='ready'?(online?(syncState==='saving'?'Сохраняем изменения…':'Общая морозилка · синхронизировано'):'Нет соединения · изменения недоступны'):'';
  $('syncStatus').classList.toggle('offline',!online);
  $('add').disabled=$('addCategory').disabled=!online;
  $('editDetails').disabled=!online;
}
function showSession(state){
  phase=state.phase;
  $('account').hidden=!state.user;$('accountEmail').textContent=state.user?.email||'';$('accountEmail').title=state.user?.email||'';
  $('authPanel').hidden=phase==='ready';$('appContent').hidden=phase!=='ready';
  $('signIn').hidden=!['signed-out','denied'].includes(phase);
  $('retryConnection').hidden=phase!=='error';
  $('authError').textContent='';
  if(phase!=='ready'){
    products=[];categories=[];connected=false;selected='all';query='';$('search').value='';
    [$('editor'),$('categoryEditor'),$('productDetails')].forEach(dialog=>dialog.close());
    $('recipeBook').hidden=true;$('inventoryView').hidden=false;
    render();
  }
  const content={
    'signed-out':['Войти в морозилку','Войдите через Google под своим аккаунтом. Доступ есть только у вас двоих.'],
    'loading':['Открываем морозилку…','Подключаемся к общему списку продуктов.'],
    'denied':['Нет доступа','Этот Google-аккаунт не добавлен в вашу общую морозилку. Можно войти под другим аккаунтом.'],
    'error':['Не удалось подключиться','Проверьте интернет и попробуйте ещё раз.'],
    'setup':['Осталось подключить Firebase','Приложение подготовлено. После настройки проекта здесь появится вход в вашу общую морозилку.']
  };
  if(content[phase]){$('authHeading').textContent=content[phase][0];$('authDescription').textContent=content[phase][1];}
  if(state.error&&phase==='error')$('authError').textContent=errorMessage(state.error);
  if(phase==='ready'){
    render();
    if(wantsToOpen){wantsToOpen=false;door(false);}
  }else door(true);
  $('openDoor').disabled=phase==='loading'||phase==='setup';
  $('doorAction').textContent=phase==='loading'?'Подключаемся…':phase==='error'?'Повторить подключение':phase==='denied'?'Войти другим аккаунтом':'Открыть морозилку';
  $('doorStatus').textContent=phase==='denied'?content.denied[1]:phase==='error'?errorMessage(state.error):phase==='setup'?content.setup[1]:'';
  syncStatus();
}
async function busy(form,action){
  if(form.dataset.busy)return;
  form.dataset.busy='true';form.setAttribute('aria-busy','true');
  const controls=[...form.querySelectorAll('input,select,button')];
  const disabled=controls.map(c=>c.disabled);controls.forEach(c=>c.disabled=true);
  try{return await action();}finally{controls.forEach((c,i)=>c.disabled=disabled[i]);delete form.dataset.busy;form.removeAttribute('aria-busy');}
}
[$('editor'),$('categoryEditor')].forEach(dialog=>dialog.addEventListener('cancel',e=>{if(dialog.querySelector('form').dataset.busy)e.preventDefault();}));
function requireReady(){if(phase!=='ready'||!connected||!navigator.onLine){notify('Нет соединения с общей морозилкой. Попробуйте после подключения.');return false;}return true;}

$('categories').addEventListener('click',e=>{const button=e.target.closest('[data-category]');if(button){selected=button.dataset.category;render();if(!$('door').hidden)door(false);}});
$('search').addEventListener('input',e=>{query=e.target.value.trim().toLocaleLowerCase('ru');render();});
$('shelves').addEventListener('click',e=>{const button=e.target.closest('[data-product]');if(button)showProduct(button.dataset.product);if(e.target.closest('#clearFilters')){selected='all';query='';$('search').value='';render();}});
function edit(product){
  if(!requireReady())return;
  returnFocus=document.activeElement;editingOriginal=product?{...product}:null;
  $('productId').value=product?.id||'';$('productName').value=product?.name||'';
  $('productWeight').value=product?.weight??'';$('weightUnit').value=product?.weightUnit||'г';
  $('productQuantity').value=product?.quantity??'';$('quantityUnit').value=product?.quantityUnit||'шт';
  categoryOptions(product?.category||(selected==='all'?categories[0]?.id:selected));
  $('editHeading').textContent=product?'Что в упаковке?':'Добавить продукт';
  $('remove').hidden=!product;$('weightNote').hidden=!product?.uncertain;$('measureError').textContent='';
  $('editor').showModal();$('productName').focus();
}
$('editor').addEventListener('close',()=>{if(phase==='ready')returnFocus?.isConnected?returnFocus.focus():$('add').focus();});
$('add').addEventListener('click',()=>edit());$('closeModal').addEventListener('click',()=>$('editor').close());
$('productForm').addEventListener('submit',async e=>{
  e.preventDefault();if(!requireReady())return;
  const old=editingOriginal;
  try{
    const next={...old,...productData({name:$('productName').value,category:$('productCategory').value,weight:$('productWeight').value,weightUnit:$('weightUnit').value,quantity:$('productQuantity').value,quantityUnit:$('quantityUnit').value,note:old?.note||'',uncertain:old?.uncertain&&Number($('productWeight').value)===old.weight&&$('weightUnit').value===old.weightUnit})};
    $('measureError').textContent='';
    await busy($('productForm'),()=>cloud.saveProduct(next,old?.revision??null));
    $('editor').close();notify(old?'Упаковка обновлена в общей морозилке':'Добавлено в общую морозилку');
  }catch(error){$('measureError').textContent=errorMessage(error);}
});
$('remove').addEventListener('click',async()=>{
  if(!requireReady()||!editingOriginal)return;
  const old={...editingOriginal};
  try{
    await busy($('productForm'),()=>cloud.deleteProduct(old));$('editor').close();notify('Убрали из общей морозилки');
    const undo=document.createElement('button');undo.textContent='Отменить';undo.className='undo';
    undo.addEventListener('click',async()=>{undo.disabled=true;try{await cloud.saveProduct(old);notify('Упаковка возвращена');}catch(error){notify(errorMessage(error));}});
    $('toast').append(' · ',undo);clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),10000);
  }catch(error){$('measureError').textContent=errorMessage(error);}
});
function door(closed){
  document.body.classList.toggle('door-closed',closed);
  $('door').hidden=!closed;
  $('appContent').inert=closed;
  document.querySelector('.concept-bar').inert=closed;
  $('authPanel').inert=closed;
  $('doorToggle').textContent=closed?'Открыть дверцу':'Закрыть дверцу';
  if(closed){window.scrollTo(0,0);if(phase!=='loading')$('openDoor').focus();}
  else if(phase==='ready')$('doorToggle').focus();
}
$('doorToggle').addEventListener('click',()=>door($('door').hidden));
$('openDoor').addEventListener('click',()=>{
  if(phase==='ready')door(false);
  else if(phase==='error')location.reload();
  else if(phase==='signed-out'||phase==='denied'){wantsToOpen=true;signIn();}
});
function newCategory(fromEditor=false){if(!requireReady())return;categoryFromEditor=fromEditor;$('categoryName').value='';$('categoryError').textContent='';$('categoryEditor').showModal();$('categoryName').focus();}
$('addCategory').addEventListener('click',()=>newCategory());$('addCategoryFromEditor').addEventListener('click',()=>newCategory(true));$('closeCategory').addEventListener('click',()=>$('categoryEditor').close());
$('categoryForm').addEventListener('submit',async e=>{
  e.preventDefault();if(!requireReady())return;
  const name=$('categoryName').value.trim();
  if(categories.some(c=>c.name.toLocaleLowerCase('ru')===name.toLocaleLowerCase('ru'))){$('categoryError').textContent='Такая категория уже есть.';return;}
  try{
    const id=await busy($('categoryForm'),()=>cloud.addCategory({name}));
    $('categoryEditor').close();categoryOptions(categoryFromEditor?id:undefined);
    if(!categoryFromEditor){selected=id;render();door(false);}
    notify('Категория добавлена в общую морозилку');
  }catch(error){$('categoryError').textContent=errorMessage(error);}
});
function setCategoriesCollapsed(collapsed){
  $('categoryPanel').hidden=collapsed;document.querySelector('.workspace').classList.toggle('categories-collapsed',collapsed);
  $('collapseCategories').setAttribute('aria-expanded',String(!collapsed));$('expandCategories').hidden=!collapsed;
  try{localStorage.setItem('morozilka-categories-collapsed',String(collapsed));}catch{}
}
$('collapseCategories').addEventListener('click',()=>{setCategoriesCollapsed(true);$('expandCategories').focus();});
$('expandCategories').addEventListener('click',()=>{setCategoriesCollapsed(false);$('collapseCategories').focus();});
let collapsed=false;try{collapsed=localStorage.getItem('morozilka-categories-collapsed')==='true';}catch{}
setCategoriesCollapsed(collapsed);door(true);

let legacy=null;try{legacy=readLegacy(localStorage);}catch{}
$('importLocal').hidden=!legacy;
if(legacy)$('importLocal').textContent=`Перенести с этого устройства (${legacy.products.length})`;
async function importInventory(value){
  if(!requireReady())return;
  try{await busy($('importForm'),async()=>{const count=await cloud.importInventory(value);notify(`Перенесено продуктов: ${count}`);});}catch(error){$('importError').textContent=errorMessage(error);}
}
$('importLocal').addEventListener('click',()=>importInventory(legacy));
$('importFileButton').addEventListener('click',()=>$('importFile').click());
$('importFile').addEventListener('change',async e=>{
  const file=e.target.files[0];if(!file)return;
  try{if(file.size>1024*1024)throw new Error('Файл слишком большой. Максимум — 1 МБ.');await importInventory(JSON.parse(await file.text()));}catch(error){$('importError').textContent=errorMessage(error);}finally{e.target.value='';}
});
async function signIn(){
  if(!cloud)return;
  $('signIn').disabled=$('openDoor').disabled=true;
  $('authError').textContent=$('doorStatus').textContent='';
  try{await cloud.signIn();}
  catch(error){wantsToOpen=false;$('authError').textContent=$('doorStatus').textContent=errorMessage(error);}
  finally{$('signIn').disabled=false;$('openDoor').disabled=phase==='loading'||phase==='setup';}
}
$('signIn').addEventListener('click',signIn);
$('signOut').addEventListener('click',async()=>{if(!cloud)return;try{await cloud.signOut();}catch(error){notify(errorMessage(error));}});
$('retryConnection').addEventListener('click',()=>location.reload());
window.addEventListener('online',syncStatus);window.addEventListener('offline',syncStatus);

showSession({phase:'loading'});
if(!firebaseConfig?.apiKey||!firebaseConfig?.authDomain||!firebaseConfig?.projectId)showSession({phase:'setup'});
else try{
  cloud=await createCloud(firebaseConfig,{
    onSession:showSession,
    onData:data=>{products=data.products;categories=data.categories;imported=data.imported;render();},
    onSync:state=>{syncState=state;connected=state!=='offline';syncStatus();}
  });
}catch(error){showSession({phase:'error',error});}

function dishPicture(r,extra=''){
  const x=(r.image%4)*100/3,y=Math.floor(r.image/4)*100/3;
  return `<span class="dish-picture ${extra}" style="background-position:${x}% ${y}%" aria-hidden="true"></span>`;
}
function recipeCards(items){
  return items.map(r=>`<button type="button" class="recipe-card" data-recipe="${escape(r.id)}">${dishPicture(r,'dish-thumbnail')}<span class="recipe-card-copy"><span class="recipe-card-title">${escape(r.title)}</span><span>${r.minutes} мин · 2 порции</span><span class="recipe-stock">В морозилке: ${r.available} из ${r.ingredients.length} ингредиентов</span></span></button>`).join('')||'<p class="recipe-note">Для этого продукта рецептов пока нет.</p>';
}
function renderRecipes(){
  const filter=products.find(p=>p.id===bookProductId);
  if(bookProductId&&!filter)bookProductId=null;
  const q=$('recipeSearch').value.trim().toLocaleLowerCase('ru').replaceAll('ё','е'),chapter=$('recipeChapter').value;
  bookItems=filter?suggestions(filter,products).filter(r=>(chapter==='all'||r.chapter===chapter)&&`${r.title} ${r.ingredients.map(i=>i.label).join(' ')}`.toLocaleLowerCase('ru').replaceAll('ё','е').includes(q)):recipeBook(products,q,chapter);
  $('recipeCount').textContent=filter?`Для продукта «${filter.name}» · рецептов: ${bookItems.length}`:`По вашим запасам: ${bookItems.length} · в полной книге: ${recipes.length}`;
  $('allBookRecipes').hidden=!filter;
  contentsPage=Math.min(contentsPage,Math.max(0,Math.ceil(bookItems.length/6)-1));
  paintBook();
  if($('productDetails').open){
    const product=products.find(p=>p.id===detailProductId);
    if(!product)$('productDetails').close();else fillProduct(product);
  }
}
function ingredientList(r){return `<ul class="recipe-ingredients">${r.ingredients.map(i=>`<li><span>${escape(i.label)} <small>${escape(i.amount)}</small></span><span class="ingredient-status ${i.available?'in-stock':''}">${i.available?'✓ В морозилке':'Проверить дома'}</span></li>`).join('')}</ul>`;}
function paintBook(){
  const source=recipes.find(r=>r.id===bookRecipeId),index=bookItems.findIndex(r=>r.id===bookRecipeId);
  if(source){
    const r=assess(source,products);
    $('bookLeft').innerHTML=`<p class="book-kicker">${escape(r.chapter)}</p><h2 tabindex="-1" id="openRecipeHeading">${escape(r.title)}</h2><p class="book-meta">Около ${r.minutes} мин · 2 порции</p>${dishPicture(r)}<p class="illustration-caption">Иллюстрация к разделу</p><h3>Ингредиенты</h3>${ingredientList(r)}<p class="recipe-note">Наличие отмечено без проверки достаточного количества. Продукты без отметки проверьте дома.</p>`;
    $('bookRight').innerHTML=`<p class="book-kicker">Готовим дома</p><h3 class="steps-heading">Приготовление</h3><ol class="recipe-steps">${r.steps.map(step=>`<li>${escape(step)}</li>`).join('')}</ol><p class="recipe-note cooking-note">Время приблизительное, без размораживания. Указания на упаковке продукта имеют приоритет. <a href="https://www.foodsafety.gov/food-safety-charts/safe-minimum-internal-temperatures" target="_blank" rel="noopener noreferrer">Температура готовности</a>.</p><span class="printed-page" aria-hidden="true">${index>=0?index*2+2:'✳'}</span>`;
    $('bookPrevious').disabled=index<=0;$('bookNext').disabled=!bookItems.length||index>=bookItems.length-1;
    $('bookPageNumber').textContent=index>=0?`Рецепт ${index+1} из ${bookItems.length}`:'Выбранный рецепт';
  }else{
    const first=bookItems[contentsPage*6]||bookItems[0]||recipes[0];
    $('bookLeft').innerHTML=`<p class="book-kicker">Морозилка · домашняя коллекция</p><h2 class="book-title">Кулинарная<br>книга</h2><span class="book-ornament" aria-hidden="true">✳</span>${dishPicture(first,'contents-picture')}<p class="book-intro">${bookProductId?'Подборка для выбранного продукта.':'Блюда из ваших запасов.'}<br>Мясо с гарниром, супы, выпечка и что-нибудь сладкое.</p><p class="recipe-note">Картофель, крупы и другие домашние продукты тоже есть в рецептах — их наличие проверьте дома.</p>`;
    $('bookRight').innerHTML=`<p class="book-kicker">Выбираем, что приготовить</p><h3 class="steps-heading">Содержание</h3><div class="book-contents">${bookItems.slice(contentsPage*6,contentsPage*6+6).map((r,i)=>`<button class="contents-recipe" data-recipe="${escape(r.id)}"><span class="contents-number">${contentsPage*6+i+1}</span><span><strong>${escape(r.title)}</strong><small>${escape(r.chapter)} · ${r.minutes} мин</small></span><span aria-hidden="true">↗</span></button>`).join('')||'<p class="recipe-note">Подходящих рецептов пока нет. Измените запрос или выберите другой раздел.</p>'}</div><span class="printed-page" aria-hidden="true">${contentsPage+1}</span>`;
    $('bookPrevious').disabled=contentsPage===0;$('bookNext').disabled=(contentsPage+1)*6>=bookItems.length;
    $('bookPageNumber').textContent=`Содержание ${contentsPage+1} / ${Math.max(1,Math.ceil(bookItems.length/6))}`;
  }
}
function fillProduct(product){
  $('detailsHeading').textContent=product.name;$('detailsAmount').textContent=formatMeasurements(product);
  const items=suggestions(product,products);
  $('productRecipeNote').textContent=items.length?`Вариантов: ${items.length}. Домашние ингредиенты и количество проверьте по рецепту.`:'В книге пока нет подборки для этого продукта.';
  $('productRecipes').innerHTML=recipeCards(items);
  $('editDetails').disabled=!connected||!navigator.onLine;
}
function showProduct(id){
  const product=products.find(p=>p.id===id);if(!product)return;
  detailProductId=id;fillProduct(product);$('productDetails').showModal();
}
function openBook(id=null,productId=null){
  bookRecipeId=id;bookProductId=productId;contentsPage=0;$('recipeSearch').value='';$('recipeChapter').value='all';
  $('inventoryView').hidden=true;$('recipeBook').hidden=false;renderRecipes();$('backToFreezer').focus();window.scrollTo(0,0);
  if(!matchMedia('(prefers-reduced-motion: reduce)').matches)$('bookSpread').animate([{opacity:0,transform:'perspective(1400px) rotateY(-7deg)'},{opacity:1,transform:'perspective(1400px) rotateY(0deg)'}],{duration:420,easing:'ease-out'});
}
function turnBook(direction){
  if(bookRecipeId){const index=bookItems.findIndex(r=>r.id===bookRecipeId),next=bookItems[index+direction];if(!next)return;bookRecipeId=next.id;}
  else contentsPage+=direction;
  paintBook();
  if(!matchMedia('(prefers-reduced-motion: reduce)').matches)$('bookSpread').animate([{opacity:.65,transform:`perspective(1400px) rotateY(${direction*3}deg)`},{opacity:1,transform:'perspective(1400px) rotateY(0deg)'}],{duration:320,easing:'ease-out'});
  $('bookSpread').scrollIntoView({block:'start',behavior:'auto'});
}
$('recipeChapter').innerHTML+=[...chapters].map(c=>`<option value="${escape(c)}">${escape(c)}</option>`).join('');
$('openRecipes').addEventListener('click',()=>openBook());
$('backToFreezer').addEventListener('click',()=>{$('recipeBook').hidden=true;$('inventoryView').hidden=false;$('openRecipes').focus();});
function resetBookSearch(){bookRecipeId=null;contentsPage=0;renderRecipes();}
$('recipeSearch').addEventListener('input',resetBookSearch);$('recipeChapter').addEventListener('change',resetBookSearch);
$('allBookRecipes').addEventListener('click',()=>{bookProductId=null;resetBookSearch();});
$('bookContentsButton').addEventListener('click',()=>{bookRecipeId=null;renderRecipes();});
$('bookPrevious').addEventListener('click',()=>turnBook(-1));$('bookNext').addEventListener('click',()=>turnBook(1));
$('recipeBook').addEventListener('keydown',e=>{if(e.target.matches('input,select'))return;if(e.key==='ArrowLeft'&&!$('bookPrevious').disabled){e.preventDefault();turnBook(-1);}if(e.key==='ArrowRight'&&!$('bookNext').disabled){e.preventDefault();turnBook(1);}});
$('bookSpread').addEventListener('click',e=>{const button=e.target.closest('[data-recipe]');if(button){bookRecipeId=button.dataset.recipe;paintBook();$('openRecipeHeading').focus();$('bookSpread').scrollIntoView({block:'start'});}});
$('productRecipes').addEventListener('click',e=>{const button=e.target.closest('[data-recipe]');if(button){$('productDetails').close();openBook(button.dataset.recipe,detailProductId);}});
$('closeDetails').addEventListener('click',()=>$('productDetails').close());
$('productDetails').addEventListener('close',()=>{if(phase==='ready'&&$('recipeBook').hidden)document.querySelector(`[data-product="${CSS.escape(detailProductId||'')}"]`)?.focus();});
$('editDetails').addEventListener('click',()=>{const product=products.find(p=>p.id===detailProductId);if(product){$('productDetails').close();edit(product);returnFocus=document.querySelector(`[data-product="${CSS.escape(product.id)}"]`);}});
