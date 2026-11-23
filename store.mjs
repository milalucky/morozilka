import {categories as defaults} from './data.mjs';
import {productData,categoryData,categoryId,validateImport} from './model.mjs';

export function createInventoryStore(db,dbSDK,requireConnection=()=>{}) {
  const root=dbSDK.doc(db,'freezers/home');
  const productsRef=dbSDK.collection(root,'products');
  const categoriesRef=dbSDK.collection(root,'categories');
  const timestamp=dbSDK.serverTimestamp;
  async function initialize() {
    await dbSDK.runTransaction(db, async transaction => {
      const metadata = await transaction.get(root);
      if (metadata.exists()) return;
      transaction.set(root, {schemaVersion:1,createdAt:timestamp(),initialImportComplete:false});
      defaults.forEach((c,order)=>transaction.set(dbSDK.doc(categoriesRef,c.id),categoryData({...c,order})));
    });
  }

  return {root,productsRef,categoriesRef,initialize,
    async saveProduct(input, expectedRevision=null) {
      requireConnection();
      const data=productData(input),ref=dbSDK.doc(productsRef,input.id||crypto.randomUUID());
      await dbSDK.runTransaction(db,async transaction=>{
        const previous=await transaction.get(ref);
        if(expectedRevision==null&&previous.exists())throw new Error('Эта упаковка уже существует. Обновите список.');
        if(expectedRevision!=null&&(!previous.exists()||previous.data().revision!==expectedRevision))throw new Error('Продукт уже изменён на другом устройстве. Закройте карточку и откройте её снова, чтобы увидеть изменения.');
        transaction.set(ref,{...data,revision:expectedRevision==null?1:expectedRevision+1,updatedAt:timestamp()});
      });
    },
    async deleteProduct(input) {
      requireConnection();
      const ref=dbSDK.doc(productsRef,input.id);
      await dbSDK.runTransaction(db,async transaction=>{
        const previous=await transaction.get(ref);
        if(!previous.exists()||previous.data().revision!==input.revision)throw new Error('Продукт уже изменён на другом устройстве. Откройте карточку заново.');
        transaction.delete(ref);
      });
    },
    async addCategory(input) {
      requireConnection();
      const data=categoryData(input),id=categoryId(data.name),ref=dbSDK.doc(categoriesRef,id);
      await dbSDK.runTransaction(db,async transaction=>{
        if((await transaction.get(ref)).exists())throw new Error('Такая категория уже есть.');
        transaction.set(ref,data);
      });
      return id;
    },
    async importInventory(input) {
      requireConnection();
      const value=validateImport(input);
      const categoryRefs=value.categories.map(c=>dbSDK.doc(categoriesRef,c.id));
      const productRefs=value.products.map(p=>dbSDK.doc(productsRef,p.id));
      let count=0;
      await dbSDK.runTransaction(db,async transaction=>{
        const metadata=await transaction.get(root);
        if(metadata.data()?.initialImportComplete)throw new Error('Первоначальный перенос уже выполнен. Новые продукты добавляйте через «Добавить».');
        const existingCategories=await Promise.all(categoryRefs.map(ref=>transaction.get(ref)));
        const existingProducts=await Promise.all(productRefs.map(ref=>transaction.get(ref)));
        count=0;
        value.categories.forEach((c,i)=>{if(!existingCategories[i].exists())transaction.set(categoryRefs[i],categoryData(c));});
        value.products.forEach((p,i)=>{if(!existingProducts[i].exists()){transaction.set(productRefs[i],{...productData(p),revision:1,updatedAt:timestamp()});count++;}});
        transaction.update(root,{initialImportComplete:true});
      });
      return count;
    }
  };
}
