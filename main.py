import os, uuid, secrets
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional
from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Form, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import create_engine, String, Float, Integer, Text, DateTime, Boolean, ForeignKey
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, Session, relationship, sessionmaker
import jwt
import hashlib, hmac, base64
try:
    import cloudinary
    import cloudinary.uploader
except Exception:
    cloudinary=None

BASE = Path(__file__).resolve().parent
UPLOAD_DIR = BASE / 'uploads'
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
DATABASE_URL = os.getenv('DATABASE_URL', 'sqlite:///./noujoud.db')
if DATABASE_URL.startswith('postgres://'):
    DATABASE_URL = DATABASE_URL.replace('postgres://', 'postgresql+psycopg://', 1)
elif DATABASE_URL.startswith('postgresql://'):
    DATABASE_URL = DATABASE_URL.replace('postgresql://', 'postgresql+psycopg://', 1)
connect_args = {'check_same_thread': False} if DATABASE_URL.startswith('sqlite') else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)

SECRET = os.getenv('SECRET_KEY', 'CHANGE-ME-NOUJOUD-SECRET')
ADMIN_PIN = os.getenv('ADMIN_PIN', '1234')
def hash_password(password):
    salt=secrets.token_bytes(16)
    dk=hashlib.pbkdf2_hmac('sha256', password.encode(), salt, 180000)
    return base64.urlsafe_b64encode(salt).decode()+'.'+base64.urlsafe_b64encode(dk).decode()
def verify_password(password, stored):
    try:
        a,b=stored.split('.',1); salt=base64.urlsafe_b64decode(a.encode()); expected=base64.urlsafe_b64decode(b.encode()); got=hashlib.pbkdf2_hmac('sha256', password.encode(), salt, 180000); return hmac.compare_digest(got,expected)
    except Exception: return False

class Base(DeclarativeBase): pass
class Category(Base):
    __tablename__='categories'; id:Mapped[str]=mapped_column(String(50),primary_key=True); name:Mapped[str]=mapped_column(String(200),unique=True); emoji:Mapped[str]=mapped_column(String(20),default='🛍️'); image:Mapped[Optional[str]]=mapped_column(Text,nullable=True)
class Product(Base):
    __tablename__='products'; id:Mapped[str]=mapped_column(String(50),primary_key=True); name:Mapped[str]=mapped_column(String(200)); cat:Mapped[str]=mapped_column(String(200)); price:Mapped[float]=mapped_column(Float,default=0); stock:Mapped[int]=mapped_column(Integer,default=0); size:Mapped[str]=mapped_column(String(500),default=''); color:Mapped[str]=mapped_column(String(500),default=''); badge:Mapped[str]=mapped_column(String(100),default=''); desc:Mapped[str]=mapped_column(Text,default=''); image:Mapped[Optional[str]]=mapped_column(Text,nullable=True); emoji:Mapped[str]=mapped_column(String(20),default='🛍️')
class DeliveryZone(Base):
    __tablename__='delivery_zones'; id:Mapped[str]=mapped_column(String(50),primary_key=True); name:Mapped[str]=mapped_column(String(200),unique=True); fee:Mapped[float]=mapped_column(Float,default=0)
class Order(Base):
    __tablename__='orders'; id:Mapped[str]=mapped_column(String(50),primary_key=True); invoice_no:Mapped[str]=mapped_column(String(50),unique=True); customer:Mapped[str]=mapped_column(String(200)); phone:Mapped[str]=mapped_column(String(80)); address:Mapped[str]=mapped_column(Text); delivery_zone:Mapped[str]=mapped_column(String(200),default=''); delivery_fee:Mapped[float]=mapped_column(Float,default=0); subtotal:Mapped[float]=mapped_column(Float,default=0); total:Mapped[float]=mapped_column(Float,default=0); status:Mapped[str]=mapped_column(String(50),default='جديد'); driver:Mapped[str]=mapped_column(String(200),default=''); delivery_status:Mapped[str]=mapped_column(String(50),default='غير مسند'); lat:Mapped[Optional[float]]=mapped_column(Float,nullable=True); lng:Mapped[Optional[float]]=mapped_column(Float,nullable=True); date:Mapped[datetime]=mapped_column(DateTime,default=lambda:datetime.now(timezone.utc))
class OrderItem(Base):
    __tablename__='order_items'; id:Mapped[int]=mapped_column(Integer,primary_key=True,autoincrement=True); order_id:Mapped[str]=mapped_column(ForeignKey('orders.id',ondelete='CASCADE')); name:Mapped[str]=mapped_column(String(200)); qty:Mapped[int]=mapped_column(Integer); price:Mapped[float]=mapped_column(Float); size:Mapped[str]=mapped_column(String(200),default=''); color:Mapped[str]=mapped_column(String(200),default='')
class Driver(Base):
    __tablename__='drivers'; id:Mapped[str]=mapped_column(String(50),primary_key=True); name:Mapped[str]=mapped_column(String(200)); username:Mapped[str]=mapped_column(String(100),unique=True); password_hash:Mapped[str]=mapped_column(String(255)); active:Mapped[bool]=mapped_column(Boolean,default=True)

Base.metadata.create_all(engine)
app=FastAPI(title='NOUJOUD Online API',version='1.0')
origins=[x.strip() for x in os.getenv('CORS_ORIGINS','*').split(',') if x.strip()]
app.add_middleware(CORSMiddleware,allow_origins=origins if origins!=['*'] else ['*'],allow_credentials=True,allow_methods=['*'],allow_headers=['*'])
app.mount('/uploads',StaticFiles(directory=str(UPLOAD_DIR)),name='uploads')

def db():
    s=SessionLocal()
    try: yield s
    finally: s.close()

def token(role, sub='admin', driver_id=None):
    return jwt.encode({'role':role,'sub':sub,'driver_id':driver_id,'exp':datetime.now(timezone.utc)+timedelta(days=7)},SECRET,algorithm='HS256')
def auth(request:Request):
    h=request.headers.get('authorization','')
    if not h.startswith('Bearer '): raise HTTPException(401,'غير مصرح')
    try: p=jwt.decode(h[7:],SECRET,algorithms=['HS256']); return p
    except Exception: raise HTTPException(401,'انتهت الجلسة')
def admin_auth(p=Depends(auth)):
    if p.get('role')!='admin': raise HTTPException(403,'صلاحيات الإدارة مطلوبة')
    return p
def driver_auth(p=Depends(auth)):
    if p.get('role')!='driver': raise HTTPException(403,'صلاحيات السائق مطلوبة')
    return p

def defaults(s):
    if s.query(Category).count()==0:
        for i,(n,e) in enumerate([('نسائي','👗'),('رجالي','👔'),('أطفال','🧒'),('مستلزمات أطفال','🍼'),('ألعاب','🧸'),('قصص أطفال','📚'),('عطور','🌸'),('إكسسوارات','💍'),('حقائب وأحذية','👜'),('منزلي','🏠'),('معدات','🧰'),('عروض','🏷️')]): s.add(Category(id='c'+str(i),name=n,emoji=e,image=''))
    if s.query(DeliveryZone).count()==0:
        for i,(n,f) in enumerate([('بيروت',3),('ضواحي بيروت',4),('جبل لبنان',5),('باقي لبنان',7)]): s.add(DeliveryZone(id='z'+str(i+1),name=n,fee=f))
    s.commit()
with SessionLocal() as s: defaults(s)

def img_save(file:UploadFile|None):
    if not file or not file.filename: return ''
    if cloudinary and os.getenv('CLOUDINARY_URL'):
        try:
            result=cloudinary.uploader.upload(file.file, folder='noujoud/products', resource_type='image')
            return result.get('secure_url','')
        except Exception:
            pass
    ext=Path(file.filename).suffix.lower() or '.jpg'; name=f'{uuid.uuid4().hex}{ext}'
    p=UPLOAD_DIR/name; p.write_bytes(file.file.read()); return f'/uploads/{name}'

def product_dict(p): return {'id':p.id,'name':p.name,'cat':p.cat,'price':p.price,'stock':p.stock,'size':p.size,'color':p.color,'badge':p.badge,'desc':p.desc,'image':p.image or '','emoji':p.emoji}
def cat_dict(c): return {'id':c.id,'name':c.name,'emoji':c.emoji,'image':c.image or ''}
def zone_dict(z): return {'id':z.id,'name':z.name,'fee':z.fee}
def order_dict(s,o):
    items=s.query(OrderItem).filter_by(order_id=o.id).all()
    return {'id':o.id,'invoiceNo':o.invoice_no,'customer':o.customer,'phone':o.phone,'address':o.address,'deliveryZone':o.delivery_zone,'deliveryFee':o.delivery_fee,'subtotal':o.subtotal,'total':o.total,'status':o.status,'driver':o.driver,'deliveryStatus':o.delivery_status,'lat':o.lat,'lng':o.lng,'date':o.date.isoformat(),'items':[{'name':i.name,'qty':i.qty,'price':i.price,'size':i.size,'color':i.color} for i in items]}

@app.get('/api/health')
def health(): return {'ok':True,'service':'NOUJOUD Online API'}
@app.post('/api/admin/login')
def admin_login(body:dict):
    if str(body.get('pin',''))!=ADMIN_PIN: raise HTTPException(401,'رمز الإدارة غير صحيح')
    return {'token':token('admin')}
@app.get('/api/catalog')
def catalog(s:Session=Depends(db)):
    return {'products':[product_dict(x) for x in s.query(Product).all()],'categories':[cat_dict(x) for x in s.query(Category).all()],'deliveryZones':[zone_dict(x) for x in s.query(DeliveryZone).all()]}

@app.post('/api/admin/products')
def add_product(name:str=Form(...),cat:str=Form(...),price:float=Form(0),stock:int=Form(0),size:str=Form(''),color:str=Form(''),badge:str=Form(''),desc:str=Form(''),emoji:str=Form('🛍️'),image:UploadFile|None=File(None), p=Depends(admin_auth),s:Session=Depends(db)):
    x=Product(id='p'+uuid.uuid4().hex[:12],name=name.strip(),cat=cat,price=price,stock=stock,size=size,color=color,badge=badge,desc=desc,emoji=emoji,image=img_save(image)); s.add(x);s.commit();return product_dict(x)
@app.put('/api/admin/products/{pid}')
def edit_product(pid:str,name:str=Form(...),cat:str=Form(...),price:float=Form(0),stock:int=Form(0),size:str=Form(''),color:str=Form(''),badge:str=Form(''),desc:str=Form(''),emoji:str=Form('🛍️'),image:UploadFile|None=File(None),p=Depends(admin_auth),s:Session=Depends(db)):
    x=s.get(Product,pid)
    if not x: raise HTTPException(404,'المنتج غير موجود')
    x.name=name.strip();x.cat=cat;x.price=price;x.stock=stock;x.size=size;x.color=color;x.badge=badge;x.desc=desc;x.emoji=emoji
    if image and image.filename: x.image=img_save(image)
    s.commit();return product_dict(x)
@app.delete('/api/admin/products/{pid}')
def del_product(pid:str,p=Depends(admin_auth),s:Session=Depends(db)):
    x=s.get(Product,pid)
    if not x: raise HTTPException(404,'المنتج غير موجود')
    s.delete(x);s.commit();return {'ok':True}

@app.post('/api/admin/categories')
def add_cat(name:str=Form(...),emoji:str=Form('🛍️'),image:UploadFile|None=File(None),p=Depends(admin_auth),s:Session=Depends(db)):
    x=Category(id='c'+uuid.uuid4().hex[:12],name=name.strip(),emoji=emoji,image=img_save(image));s.add(x);s.commit();return cat_dict(x)
@app.put('/api/admin/categories/{cid}')
def edit_cat(cid:str,name:str=Form(...),emoji:str=Form('🛍️'),image:UploadFile|None=File(None),p=Depends(admin_auth),s:Session=Depends(db)):
    x=s.get(Category,cid)
    if not x: raise HTTPException(404,'القسم غير موجود')
    old=x.name;x.name=name.strip();x.emoji=emoji
    if image and image.filename:x.image=img_save(image)
    for pr in s.query(Product).filter(Product.cat==old).all(): pr.cat=x.name
    s.commit();return cat_dict(x)
@app.delete('/api/admin/categories/{cid}')
def del_cat(cid:str,p=Depends(admin_auth),s:Session=Depends(db)):
    x=s.get(Category,cid)
    if not x: raise HTTPException(404,'القسم غير موجود')
    if s.query(Product).filter(Product.cat==x.name).count(): raise HTTPException(400,'لا يمكن حذف قسم يحتوي منتجات')
    s.delete(x);s.commit();return {'ok':True}

@app.post('/api/admin/delivery-zones')
def add_zone(body:dict,p=Depends(admin_auth),s:Session=Depends(db)):
    x=DeliveryZone(id='z'+uuid.uuid4().hex[:12],name=str(body['name']).strip(),fee=float(body.get('fee',0)));s.add(x);s.commit();return zone_dict(x)
@app.put('/api/admin/delivery-zones/{zid}')
def edit_zone(zid:str,body:dict,p=Depends(admin_auth),s:Session=Depends(db)):
    x=s.get(DeliveryZone,zid)
    if not x: raise HTTPException(404,'المنطقة غير موجودة')
    x.name=str(body['name']).strip();x.fee=float(body.get('fee',0));s.commit();return zone_dict(x)
@app.delete('/api/admin/delivery-zones/{zid}')
def del_zone(zid:str,p=Depends(admin_auth),s:Session=Depends(db)):
    x=s.get(DeliveryZone,zid)
    if not x: raise HTTPException(404,'المنطقة غير موجودة')
    if s.query(DeliveryZone).count()<=1: raise HTTPException(400,'يجب إبقاء منطقة واحدة على الأقل')
    s.delete(x);s.commit();return {'ok':True}

@app.post('/api/orders')
def create_order(body:dict,s:Session=Depends(db)):
    zone=s.get(DeliveryZone,body.get('zoneId')) if body.get('zoneId') else None
    items=body.get('items') or []
    if not body.get('customer') or not body.get('phone') or not body.get('address') or not items: raise HTTPException(400,'البيانات ناقصة')
    subtotal=sum(float(i['price'])*int(i['qty']) for i in items);fee=float(zone.fee if zone else 0); now=datetime.now(timezone.utc)
    o=Order(id=uuid.uuid4().hex,invoice_no='NOU-'+str(int(now.timestamp()*1000))[-8:],customer=body['customer'],phone=body['phone'],address=body['address'],delivery_zone=zone.name if zone else '',delivery_fee=fee,subtotal=subtotal,total=subtotal+fee,status='جديد',driver='',delivery_status='غير مسند',lat=body.get('lat'),lng=body.get('lng'),date=now)
    s.add(o)
    for i in items:s.add(OrderItem(order_id=o.id,name=i['name'],qty=int(i['qty']),price=float(i['price']),size=i.get('size',''),color=i.get('color','')))
    s.commit();return order_dict(s,o)
@app.get('/api/admin/orders')
def admin_orders(p=Depends(admin_auth),s:Session=Depends(db)): return [order_dict(s,x) for x in s.query(Order).order_by(Order.date.desc()).all()]
@app.patch('/api/admin/orders/{oid}')
def update_order(oid:str,body:dict,p=Depends(admin_auth),s:Session=Depends(db)):
    o=s.get(Order,oid)
    if not o: raise HTTPException(404,'الطلب غير موجود')
    for k,attr in [('status','status'),('driver','driver'),('deliveryStatus','delivery_status')]:
        if k in body:setattr(o,attr,body[k])
    s.commit();return order_dict(s,o)

@app.delete('/api/admin/orders')
def clear_orders(p=Depends(admin_auth),s:Session=Depends(db)):
    s.query(OrderItem).delete(synchronize_session=False)
    s.query(Order).delete(synchronize_session=False)
    s.commit(); return {'ok':True}

@app.post('/api/admin/drivers')
def add_driver(body:dict,p=Depends(admin_auth),s:Session=Depends(db)):
    if s.query(Driver).filter_by(username=body['username']).first(): raise HTTPException(400,'اسم المستخدم موجود')
    d=Driver(id='d'+uuid.uuid4().hex[:12],name=body['name'],username=body['username'],password_hash=hash_password(body['password']));s.add(d);s.commit();return {'id':d.id,'name':d.name,'username':d.username}
@app.get('/api/admin/drivers')
def drivers(p=Depends(admin_auth),s:Session=Depends(db)): return [{'id':d.id,'name':d.name,'username':d.username} for d in s.query(Driver).filter_by(active=True).all()]
@app.delete('/api/admin/drivers/{did}')
def del_driver(did:str,p=Depends(admin_auth),s:Session=Depends(db)):
    d=s.get(Driver,did)
    if d:d.active=False;s.commit()
    return {'ok':True}
@app.post('/api/driver/login')
def driver_login(body:dict,s:Session=Depends(db)):
    d=s.query(Driver).filter_by(username=body.get('username'),active=True).first()
    if not d or not verify_password(body.get('password',''),d.password_hash): raise HTTPException(401,'اسم المستخدم أو كلمة المرور غير صحيحة')
    return {'token':token('driver',d.username,d.id),'driver':{'id':d.id,'name':d.name,'username':d.username}}
@app.get('/api/driver/orders')
def driver_orders(p=Depends(driver_auth),s:Session=Depends(db)):
    d=s.get(Driver,p.get('driver_id'))
    return [order_dict(s,x) for x in s.query(Order).filter(Order.driver==d.name,Order.status!='ملغى').order_by(Order.date.desc()).all()]
@app.patch('/api/driver/orders/{oid}')
def driver_update(oid:str,body:dict,p=Depends(driver_auth),s:Session=Depends(db)):
    d=s.get(Driver,p.get('driver_id'));o=s.get(Order,oid)
    if not o or o.driver!=d.name: raise HTTPException(404,'الطلب غير موجود')
    st=body.get('deliveryStatus',o.delivery_status);o.delivery_status=st
    if st=='تم التسليم':o.status='مكتمل'
    elif st=='بالطريق':o.status='تم الشحن'
    s.commit();return order_dict(s,o)

@app.post('/api/admin/migrate')
def migrate(body:dict,p=Depends(admin_auth),s:Session=Depends(db)):
    # Browser migration: replace same-id records when supplied. Images are kept as data URLs only if small; new uploads should use file upload.
    for c in body.get('categories',[]):
        x=s.get(Category,c.get('id')) or Category(id=c.get('id') or 'c'+uuid.uuid4().hex[:12],name=c['name'])
        x.name=c['name'];x.emoji=c.get('emoji','🛍️');x.image=c.get('image','');s.add(x)
    for pr in body.get('products',[]):
        x=s.get(Product,pr.get('id')) or Product(id=pr.get('id') or 'p'+uuid.uuid4().hex[:12],name=pr.get('name',''),cat=pr.get('cat',''),price=float(pr.get('price',0)),stock=int(pr.get('stock',0)))
        for a in ['name','cat','size','color','badge','desc','emoji']:
            if a in pr:setattr(x,a,pr[a] or '')
        x.price=float(pr.get('price',0));x.stock=int(pr.get('stock',0));
        if pr.get('image','').startswith('data:image/') and len(pr['image'])<2_000_000:x.image=pr['image']
        elif pr.get('image'):x.image=pr['image']
        s.add(x)
    for z in body.get('deliveryZones',[]):
        x=s.get(DeliveryZone,z.get('id')) or DeliveryZone(id=z.get('id') or 'z'+uuid.uuid4().hex[:12],name=z.get('name',''),fee=float(z.get('fee',0)))
        x.name=z.get('name','');x.fee=float(z.get('fee',0));s.add(x)
    for d in body.get('drivers',[]):
        if not d.get('username') or not d.get('password'): continue
        x=s.query(Driver).filter_by(username=d['username']).first()
        if not x:
            x=Driver(id='d'+uuid.uuid4().hex[:12],name=d.get('name',''),username=d['username'],password_hash=hash_password(d['password']),active=True);s.add(x)
    for od in body.get('orders',[]):
        if not od.get('customer') or not od.get('items'): continue
        inv=od.get('invoiceNo') or ('NOU-'+str(int(datetime.now().timestamp()*1000))[-8:])
        if s.query(Order).filter_by(invoice_no=inv).first(): continue
        o=Order(id=od.get('id') or uuid.uuid4().hex,invoice_no=inv,customer=od.get('customer',''),phone=od.get('phone',''),address=od.get('address',''),delivery_zone=od.get('deliveryZone',''),delivery_fee=float(od.get('deliveryFee',0)),subtotal=float(od.get('subtotal',0)),total=float(od.get('total',0)),status=od.get('status','جديد'),driver=od.get('driver',''),delivery_status=od.get('deliveryStatus','غير مسند'),lat=od.get('lat'),lng=od.get('lng'),date=datetime.fromisoformat(od['date'].replace('Z','+00:00')) if od.get('date') else datetime.now(timezone.utc));s.add(o)
        for i in od.get('items',[]): s.add(OrderItem(order_id=o.id,name=i.get('name',''),qty=int(i.get('qty',1)),price=float(i.get('price',0)),size=i.get('size',''),color=i.get('color','')))
    s.commit();return catalog(s)
