/**
 * ============================================================
 * مؤسسة بايوني للحلول الأمنية
 * Supabase Database Layer — supabase-db.js
 * ============================================================
 * هذا الملف يتعامل مع Supabase بشكل كامل ومنفصل عن باقي الكود.
 * يوفر:
 *  - CRUD كامل لكل الجداول
 *  - مزامنة تلقائية بين localStorage و Supabase
 *  - Fallback محلي عند انقطاع الاتصال
 * ============================================================
 */

// ================================================================
// ⚙️ إعدادات Supabase — يمكنك تعديلها هنا مباشرة أو إدخالها من واجهة النظام
// ================================================================
const SUPABASE_CONFIG = {
  url: 'https://ifkjpjmndkvwczgdzfae.supabase.co',
  anonKey: 'sb_publishable_JMkMQdJpliY05A75UWhTPQ_GvaP8htZ'
};

/**
 * جلب الإعدادات الحالية (يفحص التخزين المحلي أولاً ثم الكود الافتراضي)
 */
function getSupabaseConfig() {
  if (SUPABASE_CONFIG.url && !SUPABASE_CONFIG.url.includes('YOUR_PROJECT_ID') && SUPABASE_CONFIG.anonKey && !SUPABASE_CONFIG.anonKey.includes('YOUR_ANON_KEY')) {
    localStorage.setItem('ps_supabase_config', JSON.stringify(SUPABASE_CONFIG));
    return SUPABASE_CONFIG;
  }
  try {
    const saved = JSON.parse(localStorage.getItem('ps_supabase_config') || '{}');
    if (saved && saved.url && saved.anonKey && !saved.url.includes('YOUR_PROJECT_ID') && !saved.anonKey.includes('YOUR_ANON_KEY')) {
      return saved;
    }
  } catch (e) {}
  return SUPABASE_CONFIG;
}

/**
 * حفظ وتحديث الإعدادات من واجهة المستخدم
 */
async function saveSupabaseConfig(url, anonKey) {
  const cleanUrl = String(url || '').trim().replace(/\/+$/, '');
  const cleanKey = String(anonKey || '').trim();

  if (!cleanUrl || !cleanKey) {
    throw new Error('يرجى إدخال رابط المشروع ومفتاح API معاً');
  }

  localStorage.setItem('ps_supabase_config', JSON.stringify({ url: cleanUrl, anonKey: cleanKey }));
  SUPABASE_CONFIG.url = cleanUrl;
  SUPABASE_CONFIG.anonKey = cleanKey;

  // إعادة تهيئة الاتصال
  _supabase = null;
  return await initSupabase(true);
}

// ================================================================
// حالة الاتصال بـ Supabase
// ================================================================
const SupabaseState = {
  initialized: false,
  connected: false,
  syncing: false,
  error: null,
  lastSync: null,
};

// ================================================================
// تهيئة Supabase Client
// ================================================================
let _supabase = null;

async function initSupabase(forceReinit = false) {
  if (_supabase && !forceReinit) return _supabase;

  // فحص توفر المكتبة
  if (typeof supabase === 'undefined') {
    console.warn('Supabase SDK غير محمل.');
    showSyncBadge('offline');
    return null;
  }

  const cfg = getSupabaseConfig();
  if (!cfg.url || cfg.url.includes('YOUR_PROJECT_ID') || !cfg.anonKey || cfg.anonKey.includes('YOUR_ANON_KEY')) {
    SupabaseState.connected = false;
    SupabaseState.error = 'لم يتم ضبط إعدادات المشروع بعد';
    showSyncBadge('not_configured');
    return null;
  }

  try {
    _supabase = supabase.createClient(cfg.url, cfg.anonKey, {
      auth: { persistSession: false }
    });

    // اختبار الاتصال بطلب تجريبي سريع
    const { error } = await _supabase.from('projects').select('id').limit(1);
    if (error) throw error;

    SupabaseState.initialized = true;
    SupabaseState.connected = true;
    SupabaseState.error = null;
    console.log('✅ Supabase متصل بنجاح:', cfg.url);
    showSyncBadge('connected');
    return _supabase;
  } catch (e) {
    SupabaseState.connected = false;
    SupabaseState.error = e.message;
    console.warn('⚠️ خطأ في الاتصال بـ Supabase:', e.message);
    showSyncBadge('error');
    return null;
  }
}

// ================================================================
// فحص الاتصال وإرجاع تقرير مفصل
// ================================================================
async function testSupabaseConnection(url, anonKey) {
  if (typeof supabase === 'undefined') {
    return { ok: false, error: 'مكتبة Supabase SDK لم يتم تحميلها بعد.' };
  }

  const cleanUrl = String(url || '').trim().replace(/\/+$/, '');
  const cleanKey = String(anonKey || '').trim();

  if (!cleanUrl || !cleanKey) {
    return { ok: false, error: 'الرجاء إدخال الرابط والمفتاح.' };
  }

  try {
    const client = supabase.createClient(cleanUrl, cleanKey, { auth: { persistSession: false } });
    const { error } = await client.from('projects').select('id').limit(1);
    if (error) {
      if (error.code === '42P01') {
        return { ok: false, error: 'تم الاتصال ولكن الجداول غير موجودة! يرجى تشغيل كود supabase-setup.sql في الـ SQL Editor أولاً.' };
      }
      return { ok: false, error: error.message || 'خطأ في التحقق من المفاتيح.' };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message || 'تعذر الوصول إلى الرابط المحدد.' };
  }
}

// ================================================================
// إشعار نظام عائم (Toast Notification)
// ================================================================
function showSystemNotification(msg, type = 'success') {
  let toast = document.getElementById('systemToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'systemToast';
    toast.style.cssText = `
      position: fixed; top: 22px; left: 50%; transform: translateX(-50%) translateY(-100px);
      z-index: 100000; padding: 12px 24px; border-radius: 50px;
      font-family: 'Cairo', sans-serif; font-size: 14px; font-weight: 700;
      display: flex; align-items: center; gap: 10px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.18);
      transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1);
      opacity: 0; pointer-events: none;
    `;
    document.body.appendChild(toast);
  }

  const isWarn = type === 'warn' || type === 'error';
  toast.style.background = isWarn ? 'rgba(254, 242, 242, 0.96)' : 'rgba(236, 253, 243, 0.96)';
  toast.style.color = isWarn ? '#b42318' : '#027a48';
  toast.style.border = `1.5px solid ${isWarn ? '#fecdca' : '#a6f4c5'}`;
  toast.style.backdropFilter = 'blur(10px)';
  toast.innerHTML = msg;

  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';
  });

  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-50%) translateY(-100px)';
  }, 3200);
}

// ================================================================
// مؤشر حالة المزامنة التفاعلي (Badge في الواجهة)
// ================================================================
function showSyncBadge(status) {
  let badge = document.getElementById('supabaseSyncBadge');
  if (!badge) {
    badge = document.createElement('div');
    badge.id = 'supabaseSyncBadge';
    badge.style.cssText = `
      position: fixed; bottom: 20px; left: 20px; z-index: 9999;
      display: flex; align-items: center; gap: 8px;
      padding: 9px 16px; border-radius: 9999px;
      font-size: 13px; font-weight: 800; font-family: 'Cairo', sans-serif;
      box-shadow: 0 8px 24px rgba(12, 73, 57, 0.18);
      transition: all .25s cubic-bezier(0.16, 1, 0.3, 1);
      cursor: default; user-select: none;
      backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
    `;
    badge.title = 'حالة التزامن التلقائي مع قاعدة بيانات Supabase';
    document.body.appendChild(badge);
  }

  const states = {
    connected:      { bg: 'rgba(236, 253, 243, 0.94)', color: '#067647', border: '#a6f4c5', icon: '🟢', text: 'متزامن مع Supabase تلقائياً' },
    syncing:        { bg: 'rgba(255, 250, 235, 0.94)', color: '#b54708', border: '#fedf89', icon: '🔄', text: 'جاري التزامن التلقائي مع السحابة...' },
    offline:        { bg: 'rgba(254, 243, 242, 0.94)', color: '#b42318', border: '#fecdca', icon: '🔴', text: 'وضع محلي (الحفظ مستمر بأمان)' },
    error:          { bg: 'rgba(254, 243, 242, 0.94)', color: '#b42318', border: '#fecdca', icon: '⚠️', text: 'تنبيه اتصال (البيانات محفوظة محلياً)' },
    saved:          { bg: 'rgba(240, 249, 255, 0.94)', color: '#026aa2', border: '#b9e6fe', icon: '☁️', text: 'تم الحفظ في Supabase مباشرة' },
    not_configured: { bg: 'rgba(255, 251, 235, 0.94)', color: '#92400e', border: '#fcd34d', icon: '⚙️', text: 'جاري تهيئة الاتصال السحابي...' },
  };

  const s = states[status] || states['offline'];
  badge.style.background = s.bg;
  badge.style.color = s.color;
  badge.style.border = `1.5px solid ${s.border}`;
  badge.innerHTML = `<span style="font-size:14px">${s.icon}</span> <span>${s.text}</span>`;

  // وميض خفيف لحالة الحفظ ثم عودة للمتصل
  if (status === 'saved') {
    clearTimeout(badge._hideTimer);
    badge._hideTimer = setTimeout(() => {
      if (SupabaseState.connected) showSyncBadge('connected');
    }, 2800);
  }
}

// ================================================================
// تحويل كائن المشروع من شكل التطبيق إلى شكل قاعدة البيانات
// ================================================================
const ProjectMapper = {
  toDb: (p) => ({
    id:              p.id,
    name:            p.name || '',
    num:             p.num || '',
    client:          p.client || '',
    start_date:      p.start || '',
    end_date:        p.end || '',
    months:          Number(p.months || 0),
    warranty_months: Number(p.warrantyMonths || 0),
    before_tax:      Number(p.before || 0),
    tax_rate:        Number(p.tax || 15),
    after_tax:       Number(p.after || 0),
    cycle:           p.cycle || 'شهري',
    monthly:         Number(p.monthly || 0),
    collect:         p.collect || 'تحويل بنكي',
    status:          p.status || 'تحت العمل',
    service_type:    p.serviceType || '',
  }),

  fromDb: (row) => ({
    id:             row.id,
    name:           row.name,
    num:            row.num,
    client:         row.client || '',
    start:          row.start_date || '',
    end:            row.end_date || '',
    months:         Number(row.months || 0),
    warrantyMonths: Number(row.warranty_months || 0),
    before:         Number(row.before_tax || 0),
    tax:            Number(row.tax_rate || 15),
    after:          Number(row.after_tax || 0),
    cycle:          row.cycle || 'شهري',
    monthly:        Number(row.monthly || 0),
    collect:        row.collect || 'تحويل بنكي',
    status:         row.status || 'تحت العمل',
    serviceType:    row.service_type || 'غير محدد',
  }),
};

// ================================================================
// تحويل كائن الحركة (فاتورة) من/إلى قاعدة البيانات
// ================================================================
const MoveMapper = {
  toDb: (m) => ({
    id:               m.id,
    project_id:       m.projectId,
    type:             m.type || 'فاتورة',
    inv:              m.inv || '',
    amount:           Number(m.amount || 0),
    due_amount:       Number(m.dueAmount ?? m.amount ?? 0),
    issue_date:       m.issue || '',
    due_date:         m.due || '',
    inv_due:          m.invDue || 'غير مستحقة',
    money:            m.money || 'غير مستحق',
    month:            m.month || '',
    collect:          m.collect || 'تحويل بنكي',
    description:      m.desc || '',
    period_key:       m.periodKey || '',
    receivable_logged: !!m.receivableLogged,
    bank:             m.bank || '',
    transfer_date:    m.transferDate || '',
    receivable_note:  m.receivableNote || '',
  }),

  fromDb: (row) => ({
    id:               row.id,
    projectId:        row.project_id,
    type:             row.type || 'فاتورة',
    inv:              row.inv || '',
    amount:           Number(row.amount || 0),
    dueAmount:        Number(row.due_amount || 0),
    issue:            row.issue_date || '',
    due:              row.due_date || '',
    invDue:           row.inv_due || 'غير مستحقة',
    money:            row.money || 'غير مستحق',
    month:            row.month || '',
    collect:          row.collect || 'تحويل بنكي',
    desc:             row.description || '',
    periodKey:        row.period_key || '',
    receivableLogged: !!row.receivable_logged,
    bank:             row.bank || '',
    transferDate:     row.transfer_date || '',
    receivableNote:   row.receivable_note || '',
  }),
};

// ================================================================
// تحويل كائن المصروف من/إلى قاعدة البيانات
// ================================================================
const ExpenseMapper = {
  toDb: (e) => ({
    id:           e.id,
    project_id:   e.projectId,
    move_id:      e.moveId || '',
    category:     e.cat || 'أخرى',
    amount:       Number(e.amount || 0),
    expense_date: e.date || '',
    description:  e.desc || '',
  }),

  fromDb: (row) => ({
    id:        row.id,
    projectId: row.project_id,
    moveId:    row.move_id || '',
    cat:       row.category || 'أخرى',
    amount:    Number(row.amount || 0),
    date:      row.expense_date || '',
    desc:      row.description || '',
  }),
};

// ================================================================
// تحويل كائن المستخدم من/إلى قاعدة البيانات
// ================================================================
const UserMapper = {
  toDb: (u) => ({
    no:       Number(u.no || 0),
    username: u.username,
    password: u.password,
    role:     u.role || 'user',
    perms:    u.perms || {},
  }),

  fromDb: (row) => ({
    no:       Number(row.no),
    username: row.username,
    password: row.password,
    role:     row.role || 'user',
    perms:    row.perms || {},
  }),
};

// ================================================================
// API Functions — CRUD لكل الجداول
// ================================================================

/** جلب كل المستخدمين */
async function db_getUsers() {
  try {
    const sb = await initSupabase();
    if (!sb) return null;
    const { data, error } = await sb.from('app_users').select('*').order('no', { ascending: true });
    if (error) {
      if (error.code === '42P01' || error.code === 'PGRST205') return null; // الجدول غير موجود
      console.error('db_getUsers:', error);
      return null;
    }
    return data ? data.map(UserMapper.fromDb) : [];
  } catch (e) {
    return null;
  }
}

/** رفع كل المستخدمين دفعةً واحدة */
async function db_upsertAllUsers(usersArr) {
  try {
    const sb = await initSupabase();
    if (!sb) return false;
    if (!usersArr || !usersArr.length) return true;
    const { error } = await sb.from('app_users').upsert(usersArr.map(UserMapper.toDb), { onConflict: 'no' });
    if (error) {
      if (error.code === '42P01' || error.code === 'PGRST205') {
        console.warn('⚠️ جدول app_users غير موجود في Supabase. يرجى إنشاؤه للحفاظ على التزامن.');
        return false;
      }
      console.error('db_upsertAllUsers:', error);
      throw error;
    }
    return true;
  } catch (e) {
    if (e?.code === 'PGRST205' || e?.code === '42P01') return false;
    throw e;
  }
}

/** جلب كل المشاريع */
async function db_getProjects() {
  const sb = await initSupabase();
  if (!sb) return null;
  const { data, error } = await sb.from('projects').select('*').order('created_at', { ascending: true });
  if (error) { console.error('db_getProjects:', error); return null; }
  return data.map(ProjectMapper.fromDb);
}

/** حفظ/تحديث مشروع واحد */
async function db_upsertProject(project) {
  const sb = await initSupabase();
  if (!sb) return false;
  let payload = ProjectMapper.toDb(project);
  let { error } = await sb.from('projects').upsert(payload, { onConflict: 'id' });
  if (error && (error.code === 'PGRST204' || String(error.message || '').includes('service_type'))) {
    console.warn('⚠️ عمود service_type غير موجود في جدول projects بسوبابيز، جاري الحفظ بدونه تلقائياً...');
    delete payload.service_type;
    const retry = await sb.from('projects').upsert(payload, { onConflict: 'id' });
    error = retry.error;
  }
  if (error) { console.error('db_upsertProject:', error); return false; }
  return true;
}

/** حذف مشروع */
async function db_deleteProject(id) {
  const sb = await initSupabase();
  if (!sb) return false;
  const { error } = await sb.from('projects').delete().eq('id', id);
  if (error) { console.error('db_deleteProject:', error); return false; }
  return true;
}

/** رفع كل المشاريع دفعةً واحدة */
async function db_upsertAllProjects(projects) {
  const sb = await initSupabase();
  if (!sb) return false;
  if (!projects.length) {
    await sb.from('projects').delete().neq('id', '');
    return true;
  }
  let payload = projects.map(ProjectMapper.toDb);
  let { error } = await sb.from('projects').upsert(payload, { onConflict: 'id' });
  if (error && (error.code === 'PGRST204' || String(error.message || '').includes('service_type'))) {
    console.warn('⚠️ عمود service_type غير موجود في جدول projects بسوبابيز، جاري الحفظ بدونه تلقائياً...');
    payload.forEach(p => delete p.service_type);
    const retry = await sb.from('projects').upsert(payload, { onConflict: 'id' });
    error = retry.error;
  }
  if (error) { console.error('db_upsertAllProjects:', error); throw error; }
  return true;
}

/** جلب كل الحركات */
async function db_getMoves() {
  const sb = await initSupabase();
  if (!sb) return null;
  const { data, error } = await sb.from('moves').select('*').order('created_at', { ascending: true });
  if (error) { console.error('db_getMoves:', error); return null; }
  return data.map(MoveMapper.fromDb);
}

/** حفظ/تحديث حركة واحدة */
async function db_upsertMove(move) {
  const sb = await initSupabase();
  if (!sb) return false;
  const { error } = await sb.from('moves').upsert(MoveMapper.toDb(move), { onConflict: 'id' });
  if (error) { console.error('db_upsertMove:', error); return false; }
  return true;
}

/** حذف حركة */
async function db_deleteMove(id) {
  const sb = await initSupabase();
  if (!sb) return false;
  const { error } = await sb.from('moves').delete().eq('id', id);
  if (error) { console.error('db_deleteMove:', error); return false; }
  return true;
}

/** رفع كل الحركات دفعةً واحدة */
async function db_upsertAllMoves(moves) {
  const sb = await initSupabase();
  if (!sb) return false;
  if (!moves.length) {
    // حذف كل الحركات من السحابة إذا المصفوفة فارغة
    await sb.from('moves').delete().neq('id', '');
    return true;
  }
  const { error } = await sb.from('moves').upsert(moves.map(MoveMapper.toDb), { onConflict: 'id' });
  if (error) { console.error('db_upsertAllMoves:', error); throw error; }
  return true;
}

/** جلب كل المصاريف */
async function db_getExpenses() {
  const sb = await initSupabase();
  if (!sb) return null;
  const { data, error } = await sb.from('expenses').select('*').order('created_at', { ascending: true });
  if (error) { console.error('db_getExpenses:', error); return null; }
  return data.map(ExpenseMapper.fromDb);
}

/** حفظ/تحديث مصروف واحد */
async function db_upsertExpense(expense) {
  const sb = await initSupabase();
  if (!sb) return false;
  const { error } = await sb.from('expenses').upsert(ExpenseMapper.toDb(expense), { onConflict: 'id' });
  if (error) { console.error('db_upsertExpense:', error); return false; }
  return true;
}

/** حذف مصروف */
async function db_deleteExpense(id) {
  const sb = await initSupabase();
  if (!sb) return false;
  const { error } = await sb.from('expenses').delete().eq('id', id);
  if (error) { console.error('db_deleteExpense:', error); return false; }
  return true;
}

/** رفع كل المصاريف دفعةً واحدة */
async function db_upsertAllExpenses(expenses) {
  const sb = await initSupabase();
  if (!sb) return false;
  if (!expenses.length) {
    await sb.from('expenses').delete().neq('id', '');
    return true;
  }
  const { error } = await sb.from('expenses').upsert(expenses.map(ExpenseMapper.toDb), { onConflict: 'id' });
  if (error) { console.error('db_upsertAllExpenses:', error); throw error; }
  return true;
}

/** جلب كل المستخدمين */
async function db_getUsers() {
  const sb = await initSupabase();
  if (!sb) return null;
  const { data, error } = await sb.from('app_users').select('*').order('no', { ascending: true });
  if (error) { console.error('db_getUsers:', error); return null; }
  return data.map(UserMapper.fromDb);
}

/** حفظ/تحديث مستخدم */
async function db_upsertUser(user) {
  const sb = await initSupabase();
  if (!sb) return false;
  const { error } = await sb.from('app_users').upsert(UserMapper.toDb(user), { onConflict: 'no' });
  if (error) { console.error('db_upsertUser:', error); return false; }
  return true;
}

/** حذف مستخدم */
async function db_deleteUser(username) {
  const sb = await initSupabase();
  if (!sb) return false;
  const { error } = await sb.from('app_users').delete().eq('username', username);
  if (error) { console.error('db_deleteUser:', error); return false; }
  return true;
}

/** رفع كل المستخدمين */
async function db_upsertAllUsers(users) {
  const sb = await initSupabase();
  if (!sb || !users.length) return false;
  const { error } = await sb.from('app_users').upsert(users.map(UserMapper.toDb), { onConflict: 'no' });
  if (error) { console.error('db_upsertAllUsers:', error); throw error; }
  return true;
}

// ================================================================
// تحويل كائن نوع الخدمة من/إلى قاعدة البيانات
// ================================================================
const ServiceTypeMapper = {
  toDb: (s) => ({
    id:         s.id,
    name:       s.name || '',
    is_default: !!s.isDefault,
    sort_order: Number(s.sortOrder || 0),
  }),

  fromDb: (row) => ({
    id:        row.id,
    name:      row.name || '',
    isDefault: !!row.is_default,
    sortOrder: Number(row.sort_order || 0),
  }),
};

// ================================================================
// API Functions — CRUD لأنواع الخدمات
// ================================================================

/** جلب كل أنواع الخدمات */
async function db_getServiceTypes() {
  try {
    const sb = await initSupabase();
    if (!sb) return null;
    const { data, error } = await sb.from('service_types').select('*').order('sort_order', { ascending: true });
    if (error) {
      if (error.code === 'PGRST205') {
        console.warn('⚠️ جدول service_types لم يُنشأ بعد في Supabase. يرجى تشغيل كود SQL في لوحة Supabase.');
      } else {
        console.error('db_getServiceTypes:', error);
      }
      return null;
    }
    return data.map(ServiceTypeMapper.fromDb);
  } catch (e) {
    return null;
  }
}

/** حفظ/تحديث نوع خدمة واحد */
async function db_upsertServiceType(serviceType) {
  try {
    const sb = await initSupabase();
    if (!sb) return false;
    const { error } = await sb.from('service_types').upsert(ServiceTypeMapper.toDb(serviceType), { onConflict: 'id' });
    if (error) {
      if (error.code === 'PGRST205') {
        console.warn('⚠️ جدول service_types غير موجود في Supabase. قم بتشغيل كود SQL لإنشائه.');
        return false;
      }
      console.error('db_upsertServiceType:', error);
      return false;
    }
    return true;
  } catch (e) {
    return false;
  }
}

/** حذف نوع خدمة */
async function db_deleteServiceType(id) {
  try {
    const sb = await initSupabase();
    if (!sb) return false;
    const { error } = await sb.from('service_types').delete().eq('id', id);
    if (error) {
      if (error.code === 'PGRST205') return false;
      console.error('db_deleteServiceType:', error);
      return false;
    }
    return true;
  } catch (e) {
    return false;
  }
}

/** رفع كل أنواع الخدمات دفعةً واحدة */
async function db_upsertAllServiceTypes(types) {
  try {
    const sb = await initSupabase();
    if (!sb) return false;
    if (!types.length) {
      await sb.from('service_types').delete().neq('id', '');
      return true;
    }
    const { error } = await sb.from('service_types').upsert(types.map(ServiceTypeMapper.toDb), { onConflict: 'id' });
    if (error) {
      if (error.code === 'PGRST205') {
        console.warn('⚠️ جدول service_types غير موجود في Supabase. قم بتشغيل كود SQL لإنشائه.');
        return false;
      }
      console.error('db_upsertAllServiceTypes:', error);
      throw error;
    }
    return true;
  } catch (e) {
    if (e?.code === 'PGRST205') return false;
    throw e;
  }
}

/** تسجيل عملية في سجل التتبع */
async function db_logOp(timestamp, username, action, details) {
  const sb = await initSupabase();
  if (!sb) return;
  await sb.from('op_log').insert({ timestamp, username, action, details: details || '' });
}

/** جلب سجل التتبع */
async function db_getLog(limit = 200) {
  const sb = await initSupabase();
  if (!sb) return null;
  const { data, error } = await sb.from('op_log').select('*').order('created_at', { ascending: false }).limit(limit);
  if (error) { console.error('db_getLog:', error); return null; }
  return data.map(row => ({ t: row.timestamp, u: row.username, a: row.action, d: row.details }));
}

/** حفظ نسخة احتياطية */
async function db_saveBackup(timestamp, reason, data) {
  const sb = await initSupabase();
  if (!sb) return false;
  // الاحتفاظ بأحدث 10 نسخ فقط
  const { data: existing } = await sb.from('backups').select('id').order('created_at', { ascending: true });
  if (existing && existing.length >= 10) {
    const toDelete = existing.slice(0, existing.length - 9).map(r => r.id);
    await sb.from('backups').delete().in('id', toDelete);
  }
  const { error } = await sb.from('backups').insert({ timestamp, reason, data });
  if (error) { console.error('db_saveBackup:', error); return false; }
  return true;
}

/** جلب النسخ الاحتياطية */
async function db_getBackups() {
  const sb = await initSupabase();
  if (!sb) return null;
  const { data, error } = await sb.from('backups').select('*').order('created_at', { ascending: false }).limit(10);
  if (error) { console.error('db_getBackups:', error); return null; }
  return data.map(row => ({
    t: row.timestamp,
    reason: row.reason,
    ...row.data,
    _dbId: row.id,
  }));
}

// ================================================================
// مزامنة شاملة: تحميل وتوحيد كل البيانات مع Supabase تلقائياً
// ================================================================
async function db_syncAll() {
  if (SupabaseState.syncing) return false;
  SupabaseState.syncing = true;
  showSyncBadge('syncing');

  try {
    const sb = await initSupabase();
    if (!sb) {
      showSyncBadge('offline');
      return null;
    }

    const [dbProjects, dbMoves, dbExpenses, dbUsers, dbLog, dbBackups, dbServiceTypes] = await Promise.all([
      db_getProjects(),
      db_getMoves(),
      db_getExpenses(),
      db_getUsers(),
      db_getLog(),
      db_getBackups(),
      db_getServiceTypes(),
    ]);

    const localProjects = JSON.parse(localStorage.getItem('ps_projects_v2') || '[]');
    const localMoves    = JSON.parse(localStorage.getItem('ps_moves_v2')    || '[]');
    const localExpenses = JSON.parse(localStorage.getItem('ps_exps_v1')     || '[]');
    const localUsers    = JSON.parse(localStorage.getItem('ps_users_v1')    || '[]');

    // 1. دمج المشاريع بدون فقدان أي بيانات محلية أو سحابية
    const projectMap = new Map();
    (dbProjects || []).forEach(p => { if (p && p.id) projectMap.set(p.id, p); });
    (localProjects || []).forEach(p => {
      if (p && p.id && !projectMap.has(p.id)) {
        projectMap.set(p.id, p);
      }
    });
    const finalProjects = Array.from(projectMap.values());

    // 2. دمج الحركات / الفواتير
    const moveMap = new Map();
    (dbMoves || []).forEach(m => { if (m && m.id) moveMap.set(m.id, m); });
    (localMoves || []).forEach(m => {
      if (m && m.id && !moveMap.has(m.id)) {
        moveMap.set(m.id, m);
      }
    });
    const finalMoves = Array.from(moveMap.values());

    // 3. دمج المصاريف
    const expMap = new Map();
    (dbExpenses || []).forEach(e => { if (e && e.id) expMap.set(e.id, e); });
    (localExpenses || []).forEach(e => {
      if (e && e.id && !expMap.has(e.id)) {
        expMap.set(e.id, e);
      }
    });
    const finalExpenses = Array.from(expMap.values());

    // 4. دمج المستخدمين
    const userMap = new Map();
    (localUsers || []).forEach(u => { if (u && u.no !== undefined) userMap.set(Number(u.no), u); });
    (dbUsers || []).forEach(u => {
      if (u && u.no !== undefined) {
        const existing = userMap.get(Number(u.no)) || {};
        userMap.set(Number(u.no), { ...existing, ...u });
      }
    });
    const finalUsers = Array.from(userMap.values());

    // 5. دمج أنواع الخدمات
    const DEFAULT_SVC_TYPES = [
      { id: 'svc_maintenance', name: 'خدمة صيانة', is_default: true, sort_order: 1, isDefault: true, sortOrder: 1 },
      { id: 'svc_installation', name: 'خدمة تركيب', is_default: true, sort_order: 2, isDefault: true, sortOrder: 2 },
      { id: 'svc_both', name: 'خدمة صيانة وتركيب', is_default: true, sort_order: 3, isDefault: true, sortOrder: 3 }
    ];
    const localServiceTypes = JSON.parse(localStorage.getItem('ps_service_types_v1') || '[]');
    const svcMap = new Map();
    DEFAULT_SVC_TYPES.forEach(s => svcMap.set(s.id, s));
    (dbServiceTypes || []).forEach(s => {
      if (s && s.id) {
        if (s.name === 'خدمي صيانة') s.name = 'خدمة صيانة';
        if (s.name === 'خدمي تركيب') s.name = 'خدمة تركيب';
        svcMap.set(s.id, { ...svcMap.get(s.id), ...s });
      }
    });
    (localServiceTypes || []).forEach(s => {
      if (s && s.id) {
        if (s.name === 'خدمي صيانة') s.name = 'خدمة صيانة';
        if (s.name === 'خدمي تركيب') s.name = 'خدمة تركيب';
        svcMap.set(s.id, { ...svcMap.get(s.id), ...s });
      }
    });
    const finalServiceTypes = Array.from(svcMap.values());

    // 6. إذا كانت هناك بيانات محلية غير موجودة في Supabase، نرفعها فوراً
    const needUploadProjects     = finalProjects.length > (dbProjects?.length || 0);
    const needUploadMoves        = finalMoves.length > (dbMoves?.length || 0);
    const needUploadExpenses     = finalExpenses.length > (dbExpenses?.length || 0);
    const needUploadUsers        = finalUsers.length > (dbUsers?.length || 0);
    const needUploadServiceTypes = finalServiceTypes.length > (dbServiceTypes?.length || 0);

    const uploads = [];
    if (needUploadProjects && finalProjects.length)         uploads.push(db_upsertAllProjects(finalProjects));
    if (needUploadMoves && finalMoves.length)               uploads.push(db_upsertAllMoves(finalMoves));
    if (needUploadExpenses && finalExpenses.length)         uploads.push(db_upsertAllExpenses(finalExpenses));
    if (needUploadUsers && finalUsers.length)               uploads.push(db_upsertAllUsers(finalUsers));
    if (needUploadServiceTypes && finalServiceTypes.length) {
      uploads.push(db_upsertAllServiceTypes(finalServiceTypes).catch(err => {
        console.warn('تنبيه أثناء مزامنة أنواع الخدمات إلى Supabase:', err);
      }));
    }
    if (uploads.length) {
      await Promise.all(uploads);
    }

    // 7. حفظ نهائي في localStorage
    localStorage.setItem('ps_projects_v2',       JSON.stringify(finalProjects));
    localStorage.setItem('ps_moves_v2',          JSON.stringify(finalMoves));
    localStorage.setItem('ps_exps_v1',           JSON.stringify(finalExpenses));
    localStorage.setItem('ps_users_v1',          JSON.stringify(finalUsers));
    localStorage.setItem('ps_service_types_v1',  JSON.stringify(finalServiceTypes));

    if (dbLog && dbLog.length)         localStorage.setItem('ps_log_v1',     JSON.stringify(dbLog));
    if (dbBackups && dbBackups.length) localStorage.setItem('ps_backups_v1', JSON.stringify(dbBackups));

    SupabaseState.connected = true;
    SupabaseState.lastSync = new Date();
    showSyncBadge('connected');
    return { projects: finalProjects, moves: finalMoves, expenses: finalExpenses, users: finalUsers, serviceTypes: finalServiceTypes };

  } catch (e) {
    console.error('db_syncAll error:', e);
    showSyncBadge('error');
    return null;
  } finally {
    SupabaseState.syncing = false;
  }
}

// ================================================================
// وظائف save/load المحسّنة التي تجمع localStorage + Supabase
// ================================================================

/**
 * حفظ ذكي وتلقائي: يحفظ فوراً في localStorage ويرسل إلى Supabase مباشرة بدون تدخل يدوي
 */
async function smartSave(key, value) {
  // 1. حفظ محلي فوري
  localStorage.setItem(key, JSON.stringify(value));

  // 2. مزامنة مباشرة وتلقائية مع Supabase
  showSyncBadge('syncing');
  try {
    const sb = await initSupabase();
    if (!sb) {
      console.warn('⚠️ حفظ محلي فقط — Supabase غير متاح حالياً.');
      showSyncBadge('offline');
      showSystemNotification('⚠️ تم الحفظ محلياً (جاري محاولة الاتصال بالسحابة)', 'warn');
      return;
    }

    switch (key) {
      case 'ps_projects_v2':
        await db_upsertAllProjects(value);
        // مسح المشاريع التي تم حذفها محلياً
        try {
          const { data: dbRows } = await sb.from('projects').select('id');
          if (dbRows) {
            const localIds = new Set((value || []).map(p => p.id));
            const toDelete = dbRows.filter(r => !localIds.has(r.id)).map(r => r.id);
            if (toDelete.length) await sb.from('projects').delete().in('id', toDelete);
          }
        } catch (_) {}
        break;

      case 'ps_moves_v2':
        await db_upsertAllMoves(value);
        try {
          const { data: dbRows } = await sb.from('moves').select('id');
          if (dbRows) {
            const localIds = new Set((value || []).map(m => m.id));
            const toDelete = dbRows.filter(r => !localIds.has(r.id)).map(r => r.id);
            if (toDelete.length) await sb.from('moves').delete().in('id', toDelete);
          }
        } catch (_) {}
        break;

      case 'ps_exps_v1':
        await db_upsertAllExpenses(value);
        try {
          const { data: dbRows } = await sb.from('expenses').select('id');
          if (dbRows) {
            const localIds = new Set((value || []).map(e => e.id));
            const toDelete = dbRows.filter(r => !localIds.has(r.id)).map(r => r.id);
            if (toDelete.length) await sb.from('expenses').delete().in('id', toDelete);
          }
        } catch (_) {}
        break;

      case 'ps_users_v1':
        await db_upsertAllUsers(value);
        break;

      case 'ps_service_types_v1':
        await db_upsertAllServiceTypes(value);
        try {
          const { data: dbRows } = await sb.from('service_types').select('id');
          if (dbRows) {
            const localIds = new Set((value || []).map(s => s.id));
            const toDelete = dbRows.filter(r => !localIds.has(r.id)).map(r => r.id);
            if (toDelete.length) await sb.from('service_types').delete().in('id', toDelete);
          }
        } catch (_) {}
        break;
    }

    SupabaseState.connected = true;
    SupabaseState.lastSync = new Date();
    showSyncBadge('saved');
    showSystemNotification('☁️ تم الحفظ والمزامنة المباشرة مع Supabase بنجاح');
  } catch (e) {
    console.error('smartSave Supabase error:', e);
    showSyncBadge('offline');
    showSystemNotification('⚠️ تم الحفظ محلياً (حدث خطأ أثناء الرفع للسحابة)', 'warn');
  }
}

/**
 * جلب البيانات (يحاول السحابة أولاً ثم محلياً)
 */
function smartLoad(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    return v ?? fallback;
  } catch {
    return fallback;
  }
}
