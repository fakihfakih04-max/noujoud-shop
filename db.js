/* NOUJOUD shared browser database: products/images/categories/orders live in IndexedDB, not localStorage. */
(function(){
  const DB_NAME='NOUJOUD_DB_V1', DB_VERSION=1;
  const stores=['products','categories','deliveryZones','orders','drivers','settings'];
  function open(){
    return new Promise((resolve,reject)=>{
      const r=indexedDB.open(DB_NAME,DB_VERSION);
      r.onupgradeneeded=()=>{
        const db=r.result;
        stores.forEach(name=>{if(!db.objectStoreNames.contains(name))db.createObjectStore(name,{keyPath:'id'})});
      };
      r.onsuccess=()=>resolve(r.result);
      r.onerror=()=>reject(r.error);
    });
  }
  async function all(store){
    const db=await open();
    return new Promise((resolve,reject)=>{
      const t=db.transaction(store,'readonly'), req=t.objectStore(store).getAll();
      req.onsuccess=()=>resolve(req.result||[]); req.onerror=()=>reject(req.error);
    });
  }
  async function get(store,id){
    const db=await open();
    return new Promise((resolve,reject)=>{
      const req=db.transaction(store,'readonly').objectStore(store).get(id);
      req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error);
    });
  }
  async function put(store,obj){
    const db=await open();
    return new Promise((resolve,reject)=>{
      const req=db.transaction(store,'readwrite').objectStore(store).put(obj);
      req.onsuccess=()=>resolve(obj); req.onerror=()=>reject(req.error);
    });
  }
  async function remove(store,id){
    const db=await open();
    return new Promise((resolve,reject)=>{
      const req=db.transaction(store,'readwrite').objectStore(store).delete(id);
      req.onsuccess=()=>resolve(true); req.onerror=()=>reject(req.error);
    });
  }
  async function clear(store){
    const db=await open();
    return new Promise((resolve,reject)=>{
      const req=db.transaction(store,'readwrite').objectStore(store).clear();
      req.onsuccess=()=>resolve(true); req.onerror=()=>reject(req.error);
    });
  }
  async function putMany(store,items){
    const db=await open();
    return new Promise((resolve,reject)=>{
      const t=db.transaction(store,'readwrite'), os=t.objectStore(store);
      items.forEach(x=>os.put(x));
      t.oncomplete=()=>resolve(true); t.onerror=()=>reject(t.error);
    });
  }
  async function fileToDataURL(file,max=1000,quality=.78){
    if(!file)return '';
    return new Promise((resolve,reject)=>{
      const fr=new FileReader();
      fr.onerror=()=>reject(fr.error||new Error('تعذر قراءة الصورة'));
      fr.onload=()=>{
        const img=new Image();
        img.onerror=()=>reject(new Error('الصورة غير صالحة'));
        img.onload=()=>{
          const scale=Math.min(1,max/Math.max(img.naturalWidth||img.width,img.naturalHeight||img.height));
          const w=Math.max(1,Math.round((img.naturalWidth||img.width)*scale));
          const h=Math.max(1,Math.round((img.naturalHeight||img.height)*scale));
          const c=document.createElement('canvas'); c.width=w;c.height=h;
          c.getContext('2d').drawImage(img,0,0,w,h);
          resolve(c.toDataURL('image/jpeg',quality));
        };
        img.src=fr.result;
      };
      fr.readAsDataURL(file);
    });
  }
  async function migrateLegacy(){
    // One-time migration from the old localStorage version, including large data-URL images.
    const maps=[
      ['products','noujoud_products_v2'],
      ['categories','noujoud_categories_v1'],
      ['deliveryZones','noujoud_delivery_zones_v1'],
      ['orders','noujoud_orders_v1'],
      ['drivers','noujoud_drivers_v1']
    ];
    for(const [store,key] of maps){
      try{
        if((await all(store)).length) continue;
        const raw=localStorage.getItem(key);
        if(raw){
          const arr=JSON.parse(raw);
          if(Array.isArray(arr)&&arr.length) await putMany(store,arr);
        }
      }catch(e){}
    }
  }
  async function seed(catalog){
    await migrateLegacy();
    const current=await all('products');
    if(!current.length && catalog && Array.isArray(catalog.products) && catalog.products.length)
      await putMany('products',catalog.products);
    const cats=await all('categories');
    if(!cats.length && catalog && Array.isArray(catalog.categories) && catalog.categories.length)
      await putMany('categories',catalog.categories);
    const zones=await all('deliveryZones');
    if(!zones.length && catalog && Array.isArray(catalog.deliveryZones) && catalog.deliveryZones.length)
      await putMany('deliveryZones',catalog.deliveryZones);
  }
  window.NoujoudDB={open,all,get,put,remove,clear,putMany,fileToDataURL,migrateLegacy,seed};
})();