import {withDisplayData} from './model.mjs';
import {createInventoryStore} from './store.mjs';

export async function createCloud(config, handlers) {
  const [appSDK, authSDK, dbSDK] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js')
  ]);
  const auth = authSDK.getAuth(appSDK.initializeApp(config));
  await authSDK.setPersistence(auth, authSDK.browserLocalPersistence);
  const db = dbSDK.getFirestore();
  let subscriptions = [], generation = 0, connected = false;
  function stop() { subscriptions.forEach(fn=>fn()); subscriptions=[]; connected=false; }
  function requireConnection() { if (!auth.currentUser || !connected || !navigator.onLine) throw new Error('Нет соединения с общей морозилкой. Изменение пока не сохранено.'); }
  const store=createInventoryStore(db,dbSDK,requireConnection);
  const {root,productsRef,categoriesRef}=store;

  authSDK.onAuthStateChanged(auth, async user => {
    const current = ++generation;
    stop();
    if (!user) { handlers.onSession({phase:'signed-out'}); return; }
    handlers.onSession({phase:'loading',user});
    try {
      await dbSDK.getDoc(dbSDK.doc(db,'settings/access'));
      if (current !== generation) return;
      await store.initialize();
      if (current !== generation) return;
      let products=[],categories=[],imported=false,ready=false;
      const received = new Set(), server = new Map(), pending = new Map();
      function fail(error) {
        if(current!==generation)return;
        stop();
        handlers.onSession({phase:error.code==='permission-denied'?'denied':'error',user,error});
      }
      function receive(type,snapshot) {
        if(current!==generation)return;
        received.add(type);server.set(type,!snapshot.metadata.fromCache);pending.set(type,snapshot.metadata.hasPendingWrites);
        connected=received.size===3&&[...server.values()].every(Boolean);
        if(received.size===3) {
          handlers.onData({products,categories,imported});
          if(!ready&&connected){ready=true;handlers.onSession({phase:'ready',user});}
          handlers.onSync(connected?([...pending.values()].some(Boolean)?'saving':'connected'):'offline');
        }
      }
      subscriptions.push(dbSDK.onSnapshot(root,{includeMetadataChanges:true},snapshot=>{imported=snapshot.data()?.initialImportComplete===true;receive('root',snapshot);},fail));
      subscriptions.push(dbSDK.onSnapshot(categoriesRef,{includeMetadataChanges:true},snapshot=>{
        categories=snapshot.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>a.order-b.order||a.name.localeCompare(b.name,'ru'));
        receive('categories',snapshot);
      },fail));
      subscriptions.push(dbSDK.onSnapshot(productsRef,{includeMetadataChanges:true},snapshot=>{
        products=snapshot.docs.map(d=>withDisplayData(d.id,d.data())).sort((a,b)=>a.id.localeCompare(b.id,'ru',{numeric:true}));
        receive('products',snapshot);
      },fail));
    } catch(error) {
      if(current===generation) handlers.onSession({phase:error.code==='permission-denied'?'denied':'error',user,error});
    }
  }, error=>handlers.onSession({phase:'error',error}));

  return {
    ...store,
    signIn: () => { const provider=new authSDK.GoogleAuthProvider();provider.setCustomParameters({prompt:'select_account'});return authSDK.signInWithPopup(auth,provider); },
    signOut: () => authSDK.signOut(auth)
  };
}
