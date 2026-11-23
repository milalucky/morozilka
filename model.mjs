import {categories as baseCategories, migrateCategory, parseMeasurements, formatMeasurements} from './data.mjs';

export function productData(input) {
  const weight = input.weight === '' || input.weight == null ? null : Number(input.weight);
  const quantity = input.quantity === '' || input.quantity == null ? null : Number(input.quantity);
  const product = {
    name: String(input.name || '').trim(), category: String(input.category || ''),
    weight, weightUnit: input.weightUnit || 'г', quantity, quantityUnit: input.quantityUnit || 'шт',
    note: String(input.note || ''), uncertain: Boolean(input.uncertain)
  };
  if (!product.name || product.name.length > 180 || !product.category || product.category.includes('/')) throw new Error('Укажите название и категорию продукта.');
  if (weight == null && quantity == null) throw new Error('Укажите хотя бы общий вес или количество.');
  if (weight != null && (!Number.isFinite(weight) || weight <= 0 || weight > 1e6)) throw new Error('Укажите положительный вес до 1 000 000.');
  if (quantity != null && (!Number.isSafeInteger(quantity) || quantity <= 0 || quantity > 1e6)) throw new Error('Количество должно быть целым положительным числом до 1 000 000.');
  if (!['г','кг'].includes(product.weightUnit) || !['шт','уп'].includes(product.quantityUnit)) throw new Error('Проверьте единицы измерения.');
  if (product.note.length > 500) throw new Error('Описание слишком длинное.');
  return product;
}

export function categoryData(input) {
  const name = String(input.name || '').trim();
  if (!name || name.length > 40) throw new Error('Название категории должно содержать от 1 до 40 символов.');
  return {name, color: /^#[0-9a-f]{6}$/i.test(input.color) ? input.color : '#7c9d90', order: Number.isSafeInteger(input.order) ? input.order : Date.now()};
}

export function categoryId(name) { return 'custom-' + encodeURIComponent(name.trim().normalize('NFKC').toLocaleLowerCase('ru')); }

export function validateImport(value) {
  if (!value || !Array.isArray(value.products) || !Array.isArray(value.categories) || value.products.length > 400 || value.categories.length > 50) throw new Error('Нужен файл морозилки: не более 400 продуктов и 50 категорий.');
  const categories = value.categories.map((c,i) => ({id: safeId(c.id), ...categoryData({...c, order:i})}));
  const ids = new Set(categories.map(c=>c.id));
  if (ids.size !== categories.length) throw new Error('В файле повторяются категории.');
  const products = value.products.map(p => {
    const old = p.weight === undefined ? {...migrateCategory(p), ...parseMeasurements(p.amount || '')} : p;
    const clean = {id:safeId(old.id), ...productData(old)};
    if (!ids.has(clean.category)) throw new Error(`Не найдена категория для «${clean.name}».`);
    return clean;
  });
  if (new Set(products.map(p=>p.id)).size !== products.length) throw new Error('В файле повторяются идентификаторы продуктов.');
  return {categories, products};
}

function safeId(id) { if (typeof id !== 'string' || !id || id.includes('/') || id.length > 400 || id === '.' || id === '..' || /^__.*__$/.test(id)) throw new Error('В файле некорректный идентификатор.'); return id; }

export function readLegacy(storage) {
  const saved = JSON.parse(storage.getItem('zapas-concepts-v1') || 'null');
  if (!Array.isArray(saved)) return null;
  const custom = JSON.parse(storage.getItem('morozilka-categories-v1') || '[]');
  const categories = [...baseCategories, ...(Array.isArray(custom) ? custom : [])];
  return validateImport({categories,products:saved});
}

export function withDisplayData(id, data) { return {...data,id,amount:formatMeasurements(data)}; }
