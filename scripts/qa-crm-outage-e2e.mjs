// Проверка 0.6: при остановленной CRM преподаватель, ученик и родитель продолжают работать.
import { readFileSync, writeFileSync } from 'node:fs';
const APP_URL = 'http://127.0.0.1:4001/api/v1';
const PASSWORD = 'QaMaestro2026!';
const STATE = new URL('./crm-outage-state.json', import.meta.url);
const mode = process.argv[2] ?? 'warm';

async function http(path, token) {
  const r = await fetch(`${APP_URL}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: r.status, json };
}
async function login(login) {
  const r = await fetch(`${APP_URL}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: login, password: PASSWORD }) });
  const json = await r.json();
  if (!json.data?.token) throw new Error(`login ${login}: ${r.status} ${JSON.stringify(json).slice(0, 160)}`);
  return json.data.token;
}
function findAll(value, predicate, out = []) {
  if (Array.isArray(value)) value.forEach((v) => findAll(v, predicate, out));
  else if (value && typeof value === 'object') { if (predicate(value)) out.push(value); Object.values(value).forEach((v) => findAll(v, predicate, out)); }
  return out;
}
const range = (() => { const d = new Date(); const f = new Date(d); f.setDate(d.getDate() - 7); const t = new Date(d); t.setDate(d.getDate() + 7); return `?from=${f.toISOString().slice(0, 10)}&to=${t.toISOString().slice(0, 10)}`; })();

if (mode === 'warm') {
  const tokens = { teacher: await login('qa_teacher_1'), student: await login('qa_student_1'), parent: await login('qa_parent_1'), admin: await login('qa_admin') };
  const students = await http('/admin/students?search=qa_student_1&limit=5', tokens.admin);
  const studentId = findAll(students.json, (o) => o.login === 'qa_student_1' || o.crmStudentId === 'QA-STUDENT-1')[0]?.id;
  const agenda = await http(`/teachers/me/offline-lessons${range}`, tokens.teacher);
  const summary = await http('/students/me/offline-summary', tokens.student);
  const family = await http(`/parents/me/children/${studentId}/offline-summary`, tokens.parent);
  console.log('warm:', { agenda: agenda.status, summary: summary.status, family: family.status, crmStale: summary.json?.data?.crmStale });
  writeFileSync(STATE, JSON.stringify({ tokens, studentId }));
} else {
  const { tokens, studentId } = JSON.parse(readFileSync(STATE, 'utf8'));
  const agenda = await http(`/teachers/me/offline-lessons${range}`, tokens.teacher);
  const lessons = findAll(agenda.json, (o) => typeof o.crmClassId === 'string').length;
  const summary = await http('/students/me/offline-summary', tokens.student);
  const family = await http(`/parents/me/children/${studentId}/offline-summary`, tokens.parent);
  const fam = family.json?.data ?? {};
  console.log('CRM down:', {
    teacherAgenda: `${agenda.status} (${lessons} lessons)`,
    studentSummary: `${summary.status} stale=${summary.json?.data?.crmStale} at=${summary.json?.data?.crmSnapshotAt}`,
    family: `${family.status} crmUnavailable=${fam.summary?.crmUnavailable} stale=${fam.summary?.crmStale} achievements=${fam.summary?.achievements?.length}`,
  });
  const ok = agenda.status === 200 && summary.status === 200 && family.status === 200 && summary.json?.data?.crmStale === true;
  if (!ok) { console.log(JSON.stringify({ agenda: agenda.json, summary: summary.json, family: family.json }).slice(0, 800)); process.exit(1); }
  console.log('\nOK: сценарий 0.6 прошёл (CRM недоступна, экраны работают на последних данных)');
}
