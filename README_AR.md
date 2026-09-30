# NOUJOUD Online — النسخة الجديدة

هذه النسخة تنقل **المنتجات، صور المنتجات، الأقسام، مناطق التوصيل، الطلبات وحسابات السائقين** من `localStorage` إلى Backend + Database.

> ملاحظة: لا يوجد تخزين «غير محدود» حرفياً. الجديد هنا أن التخزين لم يعد مقيداً بحد المتصفح. يمكن ربط الصور بتخزين سحابي خارجي عند الحاجة.

## 1) تشغيل الـBackend محلياً

```bash
cd backend
python -m venv .venv
# Windows
.venv\\Scripts\\activate
pip install -r requirements.txt
uvicorn main:app --reload
```

سيعمل على:
`http://127.0.0.1:8000`

## 2) ضبط الواجهة

افتح:
`frontend/api-config.js`

واكتب رابط الـBackend:

```js
window.NOUJOUD_API_URL = 'https://YOUR-NOUJOUD-API.onrender.com';
```

للتجربة المحلية:

```js
window.NOUJOUD_API_URL = 'http://127.0.0.1:8000';
```

## 3) Render

أنشئ Web Service جديد من مجلد `backend`.

Build Command:

```text
pip install -r requirements.txt
```

Start Command:

```text
uvicorn main:app --host 0.0.0.0 --port $PORT
```

Environment Variables:

- `DATABASE_URL` = رابط PostgreSQL
- `SECRET_KEY` = كلمة سر طويلة وعشوائية
- `ADMIN_PIN` = رمز دخول الإدارة
- `CORS_ORIGINS` = رابط موقع GitHub Pages، مثلاً `https://username.github.io`
- `CLOUDINARY_URL` = رابط Cloudinary (موصى به للصور)

## 4) GitHub Pages

ارفع محتويات مجلد `frontend` إلى مستودع الموقع، وبعدها عدّل `api-config.js` إلى رابط Render.

لا تحتاج بعد الآن إلى زر تنزيل `catalog.js` بعد كل تعديل. الـAdmin يرسل التعديل مباشرة إلى السيرفر.

## 5) نقل البيانات القديمة

إذا كانت المنتجات القديمة موجودة داخل نفس المتصفح، افتح `admin.html` بعد تشغيل السيرفر وسجّل الدخول، ثم اضغط:

**نقل البيانات إلى السيرفر**

سيتم نقل المنتجات والأقسام ومناطق الدليفري الموجودة في `localStorage` إلى قاعدة البيانات.

## 6) التخزين

الـBackend لم يعد يستخدم `localStorage` للصور. إذا وضعت `CLOUDINARY_URL` سيحفظ الصور في Cloudinary، وإلا يستخدم `backend/uploads` كحل محلي. التخزين السحابي ليس غير محدود حرفياً؛ سعته تعتمد على الخدمة والخطة، لكنه يزيل حد المتصفح الصغير الذي كان يسبب رسالة امتلاء التخزين.
