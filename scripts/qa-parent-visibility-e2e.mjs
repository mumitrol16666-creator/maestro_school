// Сквозная проверка 0.1: approve в CRM UI-маршруте → колбэк на платформу → уведомления ученику и родителю.
const CRM_URL = 'http://127.0.0.1:5002';
const APP_URL = 'http://127.0.0.1:4001/api/v1';
const QA_SECRET = 'local-maestro-qa-controller-2026';
const PASSWORD = 'QaMaestro2026!';

async function http(url, { method = 'GET', body, headers = {} } = {}) {
  const response = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
  return { status: response.status, json };
}
const appRequest = async (token, method, path, body) => {
  const result = await http(`${APP_URL}${path}`, { method, body, headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (result.status >= 400) throw new Error(`APP ${method} ${path} → ${result.status} ${JSON.stringify(result.json)}`);
  return result.json;
};
const crmRequest = async (token, method, path, body) => {
  const result = await http(`${CRM_URL}${path}`, { method, body, headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (result.status >= 400) throw new Error(`CRM ${method} ${path} → ${result.status} ${JSON.stringify(result.json)}`);
  return result.json;
};
const controller = (method, path, body) => http(`${CRM_URL}/api/qa/v1${path}`, {
  method, body, headers: { 'X-Maestro-QA-Secret': QA_SECRET },
}).then((r) => { if (r.status >= 400) throw new Error(`QA ${path} → ${r.status} ${JSON.stringify(r.json)}`); return r.json; });

async function appLogin(login) {
  const payload = await appRequest(null, 'POST', '/auth/login', { phone: login, password: PASSWORD });
  return payload.data.token;
}
async function waitFor(label, probe, attempts = 30, delayMs = 1000) {
  for (let i = 0; i < attempts; i += 1) {
    const value = await probe();
    if (value) return value;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error(`Timeout: ${label}`);
}
function dateWithOffset(days) {
  const d = new Date(); d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
function findAll(value, predicate, out = []) {
  if (Array.isArray(value)) value.forEach((v) => findAll(v, predicate, out));
  else if (value && typeof value === 'object') {
    if (predicate(value)) out.push(value);
    Object.values(value).forEach((v) => findAll(v, predicate, out));
  }
  return out;
}

const suffix = Date.now().toString(36).toUpperCase();
const teacherToken = await appLogin('qa_teacher_1');
const studentToken = await appLogin('qa_student_1');
const parentToken = await appLogin('qa_parent_1');
const adminToken = await appLogin('qa_admin');
const crmAdmin = await crmRequest(null, 'POST', '/api/auth/login', { phone: '+77000000001', password: PASSWORD });
const crmToken = crmAdmin.token ?? crmAdmin.data?.token;
if (!crmToken) throw new Error(`CRM login: ${JSON.stringify(crmAdmin).slice(0, 200)}`);

const listOf = (payload) => (Array.isArray(payload.data) ? payload.data : payload.data?.items ?? []);
// ---------- 0.4: hidden balance must not leak through notifications; amount due is one number ----------
const studentsPage = await appRequest(adminToken, 'GET', '/admin/students?search=qa_student_1&limit=5');
const studentRow = findAll(studentsPage, (o) => o.login === 'qa_student_1' || o.crmStudentId === 'QA-STUDENT-1')[0];
if (!studentRow?.id) throw new Error('student id not found: ' + JSON.stringify(studentsPage).slice(0, 200));
const studentId = studentRow.id;
const setVisibility = (showBalance) => appRequest(adminToken, 'PATCH', `/admin/students/${studentId}/parent-visibility`, {
  visibility: { showSchedule: true, showBalance, showPlanProgress: true, showAchievements: true }, reason: 'QA 0.4',
});
await setVisibility(false);
console.log('✓ политика: баланс скрыт');
const family = (await appRequest(parentToken, 'GET', `/parents/me/children/${studentId}/offline-summary`)).data;
const hiddenBalance = findAll(family, (o) => typeof o.signedAmountKzt === 'number')[0] ?? null;
console.log('ключи ответа:', Object.keys(family));
if (hiddenBalance) throw new Error('balance still visible: ' + JSON.stringify(hiddenBalance));
console.log('✓ в семейном кабинете блок оплаты скрыт');

const parentBefore = listOf(await appRequest(parentToken, 'GET', '/students/me/notifications?limit=50'));
const created = await controller('POST', '/lessons', {
  scenarioId: `VIS-${suffix}`, classType: 'individual', studentId: 'QA-STUDENT-1', teacherId: 'QA-TEACHER-1',
  date: dateWithOffset(-1), startTime: '12:00', endTime: '13:00', title: 'Проверка видимости баланса',
});
const classId = created.data.class.crmClassId;
await appRequest(teacherToken, 'POST', `/teachers/me/offline-lessons/${classId}/start`, {});
await appRequest(teacherToken, 'POST', `/teachers/me/offline-lessons/${classId}/attendance`, {
  studentId: 'QA-STUDENT-1', attended: true, attendanceStatus: 'present', teacherNote: 'ok', lessonPoints: 0,
  homeworkReview: { status: 'completed', completionPercent: 100 },
});
const roster = await appRequest(teacherToken, 'GET', `/teachers/me/offline-lessons/${classId}/students`);
const decisions = findAll(roster, (o) => Array.isArray(o.pendingHomework) && o.crmStudentId === 'QA-STUDENT-1')
  .flatMap((s) => s.pendingHomework.map((i) => ({ recipientId: i.recipientId, cycleNumber: i.cycleNumber, decision: 'accepted' })));
await appRequest(teacherToken, 'POST', `/teachers/me/offline-lessons/${classId}/submit`, {
  topic: 'Видимость', lessonSummary: 'Урок прошёл.', homeworkDraft: 'Повторить.', teacherOutcomeHint: 'held',
  learningResultsV2: { homeworkDecisions: decisions, topicUpdates: [] },
});
await waitFor('CRM pending', async () => {
  const card = await crmRequest(crmToken, 'GET', `/api/classes/${classId}`);
  return (card.class?.status ?? card.data?.status) === 'pending_admin_review' ? card : null;
});
const rateCardId = process.env.RATE_CARD_ID;
await crmRequest(crmToken, 'POST', `/api/classes/${classId}/approve`, {
  billingDecisions: [{ studentId: 'QA-STUDENT-1', membershipId: rateCardId, attendanceStatus: 'present', amount: 4000 }],
  teacherComment: 'QA approve (visibility)',
});
const parentNew = await waitFor('parent report notification', async () => {
  const list = listOf(await appRequest(parentToken, 'GET', '/students/me/notifications?limit=50'));
  const prev = new Set(parentBefore.map((n) => n.id));
  const fresh = list.filter((n) => !prev.has(n.id));
  return fresh.some((n) => ['parent_homework_reviewed', 'parent_lesson_report_ready'].includes(n.type)) ? fresh : null;
}, 40, 500);
await new Promise((r) => setTimeout(r, 3000));
const parentAll = listOf(await appRequest(parentToken, 'GET', '/students/me/notifications?limit=50'));
const prevIds = new Set(parentBefore.map((n) => n.id));
const freshTypes = parentAll.filter((n) => !prevIds.has(n.id)).map((n) => n.type);
console.log('родителю пришло:', freshTypes);
if (freshTypes.includes('parent_balance_alert')) throw new Error('balance alert leaked despite showBalance=false');
console.log('✓ balance-alert не отправлен при скрытом балансе');

await setVisibility(true);
const familyOn = (await appRequest(parentToken, 'GET', `/parents/me/children/${studentId}/offline-summary`)).data;
const shownBalance = findAll(familyOn, (o) => typeof o.signedAmountKzt === 'number')[0];
console.log('✓ политика восстановлена, баланс родителя:', shownBalance);
const crmSummary = await http(`${CRM_URL}/api/integration/v1/students/QA-STUDENT-1/offline-summary`, { headers: { Authorization: 'Bearer local-maestro-integration-secret', 'X-Integration-System': 'learning-platform' } });
const snap = crmSummary.json?.data?.balanceSnapshot;
console.log('CRM balanceSnapshot:', { classesRemainingTotal: snap?.classesRemainingTotal, debtAmountKzt: snap?.debtAmountKzt, membershipDueAmountKzt: snap?.membershipDueAmountKzt, amountDueKzt: snap?.amountDueKzt, accountBalanceKzt: snap?.accountBalanceKzt });
if (typeof snap?.amountDueKzt !== 'number') throw new Error('CRM did not return amountDueKzt');
if (shownBalance.signedAmountKzt !== (snap.amountDueKzt > 0 ? -snap.amountDueKzt : snap.accountBalanceKzt)) throw new Error('parent amount differs from CRM amount due');
console.log('\nOK: сценарий 0.4 прошёл');
