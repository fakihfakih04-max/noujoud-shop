const API=String(window.NOUJOUD_API_URL||'').replace(/\/$/,'');
let token=sessionStorage.getItem('noujoud_admin_token')||'';
let products=[],categories=[],deliveryZones=[],orders=[],drivers=[];
function esc(s=''){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}
function imageUrl(x){return x||''}
async function localApi(path,opt={}){
  await NoujoudDB.migrateLegacy();
  const method=(opt.method||'GET').toUpperCase();
  const body=opt.body;
  if(path==='/api/admin/login') return {token:'local'};
  if(path==='/api/catalog'){
    let ps=await NoujoudDB.all('products'), cs=await NoujoudDB.all('categories'), zs=await NoujoudDB.all('deliveryZones');
    if(!cs.length) cs=[
      ['نسائي','👗'],['رجالي','👔'],['أطفال','🧒'],['مستلزمات أطفال','🍼'],['ألعاب','🧸'],['قصص أطفال','📚'],['عطور','🌸'],['إكسسوارات','💍'],['حقائب وأحذية','👜'],['منزلي','🏠'],['معدات','🧰'],['عروض','🏷️']
    ].map((x,i)=>({id:'c'+i,name:x[0],emoji:x[1],image:''}));
    if(!zs.length) zs=[{id:'z1',name:'بيروت',fee:3},{id:'z2',name:'ضواحي بيروت',fee:4},{id:'z3',name:'جبل لبنان',fee:5},{id:'z4',name:'باقي لبنان',fee:7}];
    if(!cs.length){} else if((await NoujoudDB.all('categories')).length===0) await NoujoudDB.putMany('categories',cs);
    if((await NoujoudDB.all('deliveryZones')).length===0) await NoujoudDB.putMany('deliveryZones',zs);
    return {products:ps,categories:cs,deliveryZones:zs};
  }
  if(path==='/api/admin/orders') return await NoujoudDB.all('orders');
  if(path==='/api/admin/drivers') return await NoujoudDB.all('drivers');
  if(path==='/api/admin/products' && method==='POST') {
    const fd=body; const id='p'+Date.now();
    const p={id,name:fd.get('name')||'',cat:fd.get('cat')||'',price:Number(fd.get('price')||0),stock:Number(fd.get('stock')||0),size:fd.get('size')||'',color:fd.get('color')||'',badge:fd.get('badge')||'',desc:fd.get('desc')||'',emoji:fd.get('emoji')||'🛍️',image:''};
    const file=fd.get('image'); if(file && file.size) p.image=await NoujoudDB.fileToDataURL(file);
    await NoujoudDB.put('products',p); return p;
  }
  let m=path.match(/^\/api\/admin\/products\/([^/]+)$/);
  if(m && method==='DELETE'){await NoujoudDB.remove('products',m[1]);return {ok:true}}
  if(m && method==='PUT'){
    const id=m[1], old=await NoujoudDB.get('products',id), fd=body;
    const p={...(old||{}),id,name:fd.get('name')||'',cat:fd.get('cat')||'',price:Number(fd.get('price')||0),stock:Number(fd.get('stock')||0),size:fd.get('size')||'',color:fd.get('color')||'',badge:fd.get('badge')||'',desc:fd.get('desc')||'',emoji:fd.get('emoji')||old?.emoji||'🛍️'};
    const file=fd.get('image'); if(file && file.size) p.image=await NoujoudDB.fileToDataURL(file);
    await NoujoudDB.put('products',p); return p;
  }
  if(path==='/api/admin/categories' && method==='POST'){
    const fd=body,c={id:'c'+Date.now(),name:fd.get('name')||'',emoji:fd.get('emoji')||'🛍️',image:''};
    const file=fd.get('image'); if(file && file.size)c.image=await NoujoudDB.fileToDataURL(file);
    await NoujoudDB.put('categories',c); return c;
  }
  m=path.match(/^\/api\/admin\/categories\/([^/]+)$/);
  if(m && method==='DELETE'){await NoujoudDB.remove('categories',m[1]);return {ok:true}}
  if(m && method==='PUT'){
    const id=m[1],old=await NoujoudDB.get('categories',id),fd=body,c={...(old||{}),id,name:fd.get('name')||'',emoji:fd.get('emoji')||old?.emoji||'🛍️'};
    const file=fd.get('image'); if(file && file.size)c.image=await NoujoudDB.fileToDataURL(file);
    await NoujoudDB.put('categories',c); return c;
  }
  if(path==='/api/admin/delivery-zones' && method==='POST'){
    const x=JSON.parse(body); const z={id:'z'+Date.now(),name:x.name,fee:Number(x.fee||0)};await NoujoudDB.put('deliveryZones',z);return z;
  }
  m=path.match(/^\/api\/admin\/delivery-zones\/([^/]+)$/);
  if(m && method==='DELETE'){await NoujoudDB.remove('deliveryZones',m[1]);return {ok:true}}
  if(m && method==='PUT'){const x=JSON.parse(body),z={id:m[1],name:x.name,fee:Number(x.fee||0)};await NoujoudDB.put('deliveryZones',z);return z}
  m=path.match(/^\/api\/admin\/orders\/([^/]+)$/);
  if(m && method==='PATCH'){const id=m[1],old=await NoujoudDB.get('orders',id)||{id};const x=JSON.parse(body);Object.assign(old,x);await NoujoudDB.put('orders',old);return old}
  if(path==='/api/admin/orders' && method==='DELETE'){await NoujoudDB.clear('orders');return {ok:true}}
  m=path.match(/^\/api\/admin\/drivers\/([^/]+)$/);
  if(m && method==='DELETE'){await NoujoudDB.remove('drivers',m[1]);return {ok:true}}
  if(path==='/api/admin/drivers' && method==='POST'){const x=JSON.parse(body),d={id:'d'+Date.now(),...x};await NoujoudDB.put('drivers',d);return d}
  if(path==='/api/admin/migrate' && method==='POST') return {ok:true};
  throw new Error('العملية غير مدعومة في وضع GitHub');
}
async function api(path,opt={}){
  if(!API || API.includes('YOUR-NOUJOUD-API')) return localApi(path,opt);
  const h=opt.headers||{};if(token)h.Authorization='Bearer '+token;opt.headers=h;
  const r=await fetch(API+path,opt);
  if(!r.ok){let m='حدث خطأ';try{const j=await r.json();m=j.detail||m}catch{}if(r.status===401){sessionStorage.removeItem('noujoud_admin_token');showLogin()}throw Error(m)}
  return r.json();
}
function showLogin(){document.getElementById('loginScreen').classList.remove('hidden');document.getElementById('adminApp').classList.add('hidden')}
async function login(){try{const pin=document.getElementById('adminPin').value;const r=await api('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pin})});token=r.token;sessionStorage.setItem('noujoud_admin_token',token);document.getElementById('loginScreen').classList.add('hidden');document.getElementById('adminApp').classList.remove('hidden');await loadAll()}catch(e){toast(e.message)}}
document.getElementById('loginBtn').onclick=login;document.getElementById('adminPin').addEventListener('keydown',e=>{if(e.key==='Enter')login()});
async function loadAll(){try{const c=await api('/api/catalog');products=c.products||[];categories=c.categories||[];deliveryZones=c.deliveryZones||[];orders=await api('/api/admin/orders');drivers=await api('/api/admin/drivers');refreshCatSelect();resetProduct();render();renderCats();renderOrders();renderDeliveryZones();renderDrivers();renderDeliveryBoard();updateStats()}catch(e){toast(e.message)}}
const cats=document.getElementById('pCat');function refreshCatSelect(selected=''){cats.innerHTML=categories.map(x=>`<option value="${esc(x.name)}">${esc(x.name)}</option>`).join('');if(selected)cats.value=selected}
function updateStats(){const valid=orders.filter(x=>x.status!=='ملغى');document.getElementById('statProducts').textContent=products.length;document.getElementById('statCats').textContent=categories.length;document.getElementById('statOrders').textContent=orders.length;document.getElementById('statSales').textContent='$'+valid.reduce((a,x)=>a+Number(x.total||0),0).toFixed(2);document.getElementById('statDelivery').textContent='$'+valid.reduce((a,x)=>a+Number(x.deliveryFee||0),0).toFixed(2)}
function formDataProduct(){const f=new FormData();f.append('name',document.getElementById('pName').value.trim());f.append('cat',document.getElementById('pCat').value);f.append('price',document.getElementById('pPrice').value);f.append('stock',document.getElementById('pStock').value);f.append('size',document.getElementById('pSize').value.trim());f.append('color',document.getElementById('pColor').value.trim());f.append('badge',document.getElementById('pBadge').value);f.append('desc',document.getElementById('pDesc').value.trim());f.append('emoji','🛍️');const file=document.getElementById('pImage').files[0];if(file)f.append('image',file);return f}
function resetProduct(){document.getElementById('productForm').reset();document.getElementById('editId').value='';document.getElementById('cancelEdit').hidden=true;refreshCatSelect(categories[0]?.name||'')}
window.editProduct=id=>{const p=products.find(x=>x.id===id);if(!p)return;document.getElementById('editId').value=p.id;document.getElementById('pName').value=p.name;refreshCatSelect(p.cat);document.getElementById('pPrice').value=p.price;document.getElementById('pStock').value=p.stock;document.getElementById('pSize').value=p.size||'';document.getElementById('pColor').value=p.color||'';document.getElementById('pBadge').value=p.badge||'';document.getElementById('pDesc').value=p.desc||'';document.getElementById('cancelEdit').hidden=false;scrollTo({top:0,behavior:'smooth'})};
window.changeProductImage=async id=>{
  const input=document.createElement('input'); input.type='file'; input.accept='image/*';
  input.onchange=async()=>{
    const file=input.files&&input.files[0]; if(!file){input.remove();return}
    const old=products.find(x=>x.id===id); if(!old){input.remove();return}
    const image=await NoujoudDB.fileToDataURL(file);
    const p={...old,image};
    try{
      if(API && !API.includes('YOUR-NOUJOUD-API')){
        const fd=new FormData(); Object.keys(p).forEach(k=>{if(k!=='image')fd.append(k,p[k]??'')}); fd.append('image',file);
        await api('/api/admin/products/'+id,{method:'PUT',body:fd});
      }else await NoujoudDB.put('products',p);
      await loadAll(); toast('تم تغيير صورة المنتج ✓');
    }catch(e){toast(e.message)}
    input.remove();
  };
  document.body.appendChild(input); input.click();
};
window.deleteProduct=async id=>{if(!confirm('حذف هذا المنتج؟'))return;try{await api('/api/admin/products/'+id,{method:'DELETE'});await loadAll();toast('تم حذف المنتج ✓')}catch(e){toast(e.message)}};
document.getElementById('productForm').addEventListener('submit',async e=>{e.preventDefault();try{const id=document.getElementById('editId').value;await api(id?'/api/admin/products/'+id:'/api/admin/products',{method:id?'PUT':'POST',body:formDataProduct()});await loadAll();resetProduct();toast('تم حفظ المنتج ✓')}catch(err){toast(err.message)}});document.getElementById('cancelEdit').onclick=resetProduct;document.getElementById('adminSearch').oninput=render;
function render(){const q=document.getElementById('adminSearch').value.trim().toLowerCase();const arr=products.filter(p=>p.name.toLowerCase().includes(q)||p.cat.toLowerCase().includes(q));document.getElementById('adminProducts').innerHTML=arr.map(p=>`<div class="admin-product"><div class="admin-thumb">${p.image?`<img src="${imageUrl(p.image)}">`:p.emoji||'🛍️'}</div><div class="admin-info"><b>${esc(p.name)}</b><small>${esc(p.cat)} · $${p.price} · مخزون: ${p.stock}</small>${p.size||p.color?`<small>${esc([p.size,p.color].filter(Boolean).join(' · '))}</small>`:''}</div><div class="admin-actions"><button onclick="editProduct('${p.id}')">تعديل</button><button class="image-action" title="اختيار صورة من الكمبيوتر أو الاستديو" aria-label="اختيار صورة" onclick="changeProductImage('${p.id}')">🖼️</button><button class="danger" onclick="deleteProduct('${p.id}')">حذف</button></div></div>`).join('')||'<div class="empty">لا توجد منتجات.</div>'}
function catForm(){const f=new FormData();f.append('name',document.getElementById('catName').value.trim());f.append('emoji',document.getElementById('catEmoji').value.trim()||'🛍️');const file=document.getElementById('catImage').files[0];if(file)f.append('image',file);return f}
function renderCats(){document.getElementById('adminCategories').innerHTML=categories.map(c=>`<div class="cat-admin"><div class="cat-admin-img">${c.image?`<img src="${imageUrl(c.image)}" alt="">`:esc(c.emoji||'🛍️')}</div><div class="cat-admin-info"><b>${esc(c.name)}</b><small>${products.filter(p=>p.cat===c.name).length} منتج</small></div><div class="cat-admin-actions"><button onclick="editCat('${c.id}')">تعديل</button><button class="danger" onclick="deleteCat('${c.id}')">حذف</button></div></div>`).join('')||'<div class="empty">لا توجد أقسام.</div>'}
window.editCat=id=>{const c=categories.find(x=>x.id===id);if(!c)return;document.getElementById('editCatId').value=c.id;document.getElementById('catName').value=c.name;document.getElementById('catEmoji').value=c.emoji||'';document.getElementById('cancelCatEdit').hidden=false;document.getElementById('catName').scrollIntoView({behavior:'smooth',block:'center'})};window.deleteCat=async id=>{if(!confirm('حذف القسم؟'))return;try{await api('/api/admin/categories/'+id,{method:'DELETE'});await loadAll();toast('تم حذف القسم ✓')}catch(e){toast(e.message)}};
document.getElementById('categoryForm').addEventListener('submit',async e=>{e.preventDefault();try{const id=document.getElementById('editCatId').value;await api(id?'/api/admin/categories/'+id:'/api/admin/categories',{method:id?'PUT':'POST',body:catForm()});document.getElementById('categoryForm').reset();document.getElementById('editCatId').value='';document.getElementById('cancelCatEdit').hidden=true;await loadAll();toast('تم حفظ القسم ✓')}catch(err){toast(err.message)}});document.getElementById('cancelCatEdit').onclick=()=>{document.getElementById('categoryForm').reset();document.getElementById('editCatId').value='';document.getElementById('cancelCatEdit').hidden=true};
function renderDeliveryZones(){const el=document.getElementById('deliveryZonesAdmin');el.innerHTML=deliveryZones.map(z=>`<div class="cat-admin"><div class="cat-admin-img">🚚</div><div class="cat-admin-info"><b>${esc(z.name)}</b><small>$${Number(z.fee).toFixed(2)}</small></div><div class="cat-admin-actions"><button onclick="editDelivery('${z.id}')">تعديل</button><button class="danger" onclick="deleteDelivery('${z.id}')">حذف</button></div></div>`).join('')}
window.editDelivery=id=>{const z=deliveryZones.find(x=>x.id===id);if(!z)return;document.getElementById('editDeliveryId').value=z.id;document.getElementById('deliveryName').value=z.name;document.getElementById('deliveryFeeInput').value=z.fee;document.getElementById('cancelDeliveryEdit').hidden=false};window.deleteDelivery=async id=>{if(!confirm('حذف منطقة التوصيل؟'))return;try{await api('/api/admin/delivery-zones/'+id,{method:'DELETE'});await loadAll();toast('تم حذف المنطقة ✓')}catch(e){toast(e.message)}};
document.getElementById('deliveryForm').addEventListener('submit',async e=>{e.preventDefault();const id=document.getElementById('editDeliveryId').value,name=document.getElementById('deliveryName').value.trim(),fee=Number(document.getElementById('deliveryFeeInput').value);try{await api(id?'/api/admin/delivery-zones/'+id:'/api/admin/delivery-zones',{method:id?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,fee})});e.target.reset();document.getElementById('editDeliveryId').value='';document.getElementById('cancelDeliveryEdit').hidden=true;await loadAll();toast('تم حفظ المنطقة ✓')}catch(err){toast(err.message)}});document.getElementById('cancelDeliveryEdit').onclick=()=>{document.getElementById('deliveryForm').reset();document.getElementById('editDeliveryId').value='';document.getElementById('cancelDeliveryEdit').hidden=true};
function renderOrders(){const el=document.getElementById('orders');el.innerHTML=orders.length?orders.map(x=>`<div class="order"><div class="order-top"><b>${esc(x.invoiceNo)} · ${esc(x.customer)} · ${esc(x.phone)}</b><select onchange="setOrderStatus('${x.id}',this.value)">${['جديد','قيد التجهيز','تم الشحن','مكتمل','ملغى'].map(s=>`<option ${x.status===s?'selected':''}>${s}</option>`).join('')}</select></div><small>${new Date(x.date).toLocaleString('ar-LB')} · ${esc(x.deliveryZone||'')} · ${esc(x.address||'')}</small><p>${x.items.map(i=>esc(i.name)+' × '+i.qty+' = $'+(i.price*i.qty).toFixed(2)).join('<br>')}</p><div class="order-bottom"><strong>المنتجات: $${Number(x.subtotal).toFixed(2)} · الدليفري: $${Number(x.deliveryFee).toFixed(2)} · الإجمالي: $${Number(x.total).toFixed(2)}</strong><span><a class="order-wa" target="_blank" href="https://wa.me/961${String(x.phone||'').replace(/\D/g,'').replace(/^0/,'')}">💬 واتساب</a></span></div></div>`).join(''):'<div class="empty">لا توجد طلبات بعد.</div>'}
window.setOrderStatus=async(id,status)=>{try{await api('/api/admin/orders/'+id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status})});await loadAll();toast('تم تحديث حالة الطلب ✓')}catch(e){toast(e.message)}};
document.getElementById('clearOrders').onclick=async()=>{if(!confirm('مسح كل الطلبات من السيرفر؟'))return;try{await api('/api/admin/orders',{method:'DELETE'});await loadAll();toast('تم مسح الطلبات ✓')}catch(e){toast(e.message)}};document.getElementById('exportOrders').onclick=()=>exportCSV(orders,'noujoud-orders.csv');
function exportCSV(arr,name){const rows=[['الفاتورة','التاريخ','الزبون','الهاتف','العنوان','المنطقة','المجموع','الدليفري','الحالة']].concat(arr.map(x=>[x.invoiceNo,new Date(x.date).toLocaleString('ar-LB'),x.customer,x.phone,x.address,x.deliveryZone,x.subtotal,x.deliveryFee,x.status]));const csv='\ufeff'+rows.map(r=>r.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.download=name;a.click();URL.revokeObjectURL(a.href)}
function renderDrivers(){const el=document.getElementById('driverAccounts');el.innerHTML=drivers.length?drivers.map(d=>`<div class="cat-admin"><div class="cat-admin-img">🚚</div><div class="cat-admin-info"><b>${esc(d.name)}</b><small>${esc(d.username)}</small></div><div class="cat-admin-actions"><button class="danger" onclick="deleteDriver('${d.id}')">حذف</button></div></div>`).join(''):'<div class="empty">لا توجد حسابات سائقين.</div>'}
window.deleteDriver=async id=>{if(!confirm('حذف حساب السائق؟'))return;try{await api('/api/admin/drivers/'+id,{method:'DELETE'});await loadAll();toast('تم حذف الحساب')}catch(e){toast(e.message)}};document.getElementById('driverAccountForm').addEventListener('submit',async e=>{e.preventDefault();try{await api('/api/admin/drivers',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:document.getElementById('driverAccountName').value.trim(),username:document.getElementById('driverUsername').value.trim(),password:document.getElementById('driverPassword').value})});e.target.reset();await loadAll();toast('تم إنشاء حساب السائق ✓')}catch(err){toast(err.message)}});
function renderDeliveryBoard(){const el=document.getElementById('deliveryBoard');if(!el)return;const filter=document.getElementById('deliveryBoardStatus')?.value||'all';const arr=orders.filter(o=>o.status!=='ملغى'&&(filter==='all'||(o.deliveryStatus||'غير مسند')===filter));el.innerHTML=arr.length?arr.map(o=>{const map=o.lat&&o.lng?`<a class="secondary" target="_blank" href="https://www.google.com/maps?q=${o.lat},${o.lng}">📍 الخريطة</a>`:'';const wa=`https://wa.me/961${String(o.phone||'').replace(/\D/g,'').replace(/^0/,'')}`;return `<div class="delivery-card"><div><b>#${esc(o.invoiceNo)} · ${esc(o.customer)}</b><small>${esc(o.phone)} · ${esc(o.deliveryZone||'')} · ${esc(o.address||'')}</small></div><div class="delivery-actions"><select onchange="assignDriver('${o.id}',this.value)"><option value="">اختر السائق</option>${drivers.map(d=>`<option ${o.driver===d.name?'selected':''} value="${esc(d.name)}">${esc(d.name)}</option>`).join('')}</select><select onchange="setDeliveryStatus('${o.id}',this.value)">${['غير مسند','تم الاستلام','بالطريق','تم التسليم'].map(st=>`<option ${((o.deliveryStatus||'غير مسند')===st)?'selected':''}>${st}</option>`).join('')}</select>${map}<a class="secondary" target="_blank" href="${wa}">💬 واتساب</a></div></div>`}).join(''):'<div class="empty">لا توجد طلبات توصيل حالياً.</div>'}
window.assignDriver=async(id,name)=>{try{await api('/api/admin/orders/'+id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({driver:name,deliveryStatus:name?'تم الاستلام':'غير مسند'})});await loadAll();toast(name?'تم إسناد الطلب ✓':'تم إلغاء الإسناد')}catch(e){toast(e.message)}};window.setDeliveryStatus=async(id,status)=>{try{await api('/api/admin/orders/'+id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({deliveryStatus:status})});await loadAll();toast('تم تحديث حالة التوصيل ✓')}catch(e){toast(e.message)}};document.getElementById('deliveryBoardStatus').onchange=renderDeliveryBoard;document.getElementById('refreshDeliveryBoard').onclick=loadAll;
function renderReport(){const from=document.getElementById('reportFrom').value,to=document.getElementById('reportTo').value,status=document.getElementById('reportStatus').value;const arr=orders.filter(x=>(!from||x.date.slice(0,10)>=from)&&(!to||x.date.slice(0,10)<=to)&&(status==='all'||x.status===status));const valid=arr.filter(x=>x.status!=='ملغى');document.getElementById('reportCards').innerHTML=`<div class="admin-stats"><div><b>${valid.length}</b><small>الطلبات</small></div><div><b>$${valid.reduce((a,x)=>a+x.total,0).toFixed(2)}</b><small>المبيعات</small></div><div><b>$${valid.reduce((a,x)=>a+x.deliveryFee,0).toFixed(2)}</b><small>الدليفري</small></div></div>`;document.getElementById('reportTable').innerHTML=arr.map(x=>`<div class="order"><b>${esc(x.invoiceNo)} · ${esc(x.customer)}</b><small>${new Date(x.date).toLocaleString('ar-LB')} · ${esc(x.status)}</small><strong>$${Number(x.total).toFixed(2)}</strong></div>`).join('')||'<div class="empty">لا توجد بيانات ضمن الفلتر.</div>'}
document.getElementById('applyReport').onclick=renderReport;document.getElementById('printReport').onclick=()=>{renderReport();const w=window.open('','_blank');w.document.write('<html dir="rtl"><head><title>NOUJOUD</title></head><body>'+document.getElementById('reportCards').outerHTML+document.getElementById('reportTable').outerHTML+'</body></html>');w.document.close();w.print()};document.getElementById('exportReport').onclick=()=>{const from=document.getElementById('reportFrom').value,to=document.getElementById('reportTo').value,status=document.getElementById('reportStatus').value;exportCSV(orders.filter(x=>(!from||x.date.slice(0,10)>=from)&&(!to||x.date.slice(0,10)<=to)&&(status==='all'||x.status===status)),'noujoud-sales-report.csv')};
async function migrateOldData(){try{const body={products:JSON.parse(localStorage.getItem('noujoud_products_v2')||'[]'),categories:JSON.parse(localStorage.getItem('noujoud_categories_v1')||'[]'),deliveryZones:JSON.parse(localStorage.getItem('noujoud_delivery_zones_v1')||'[]'),orders:JSON.parse(localStorage.getItem('noujoud_orders_v1')||'[]'),drivers:JSON.parse(localStorage.getItem('noujoud_driver_accounts_v1')||'[]')};if(!body.products.length&&!body.categories.length&&!body.orders.length)return toast('لا توجد بيانات قديمة في هذا المتصفح');await api('/api/admin/migrate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});await loadAll();toast('تم نقل المنتجات والأقسام للسيرفر ✓')}catch(e){toast(e.message)}}
function addMigrationButton(){const card=document.createElement('section');card.className='admin-card';card.innerHTML='<div class="admin-title"><h2>☁️ نقل البيانات القديمة</h2><span>مرة واحدة فقط</span></div><p>ينقل المنتجات والأقسام ومناطق الدليفري الموجودة حالياً في هذا المتصفح إلى قاعدة البيانات الجديدة.</p><button class="primary" id="migrateOld">نقل البيانات إلى السيرفر</button>';document.querySelector('.admin-main').insertBefore(card,document.querySelector('.publish-card'));document.getElementById('migrateOld').onclick=migrateOldData}
function toast(t){const e=document.getElementById('toast');e.textContent=t;e.classList.add('show');setTimeout(()=>e.classList.remove('show'),2000)}
if(token){document.getElementById('loginScreen').classList.add('hidden');document.getElementById('adminApp').classList.remove('hidden');loadAll()}else showLogin();addMigrationButton();
