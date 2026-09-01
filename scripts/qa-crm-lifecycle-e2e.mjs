const CRM_URL = process.env.QA_CRM_URL || 'http://127.0.0.1:5002';
const APP_URL = process.env.QA_APP_API_URL || 'http://127.0.0.1:4001/api/v1';
const QA_SECRET = process.env.MAESTRO_QA_CONTROLLER_SECRET || 'local-maestro-qa-controller-2026';
const INTEGRATION_SECRET = process.env.INTEGRATION_SERVICE_SECRET || 'local-maestro-integration-secret';
const PASSWORD = 'QaMaestro2026!';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, {
    method: options.method || 'GET',
    headers: {
      Accept: 'application/json',
      ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  const expected = options.expected ?? 200;
  if (response.status !== expected) {
    throw new Error(`${options.method || 'GET'} ${url} returned ${response.status}, expected ${expected}: ${JSON.stringify(payload)}`);
  }
  return payload;
}

function qaController(method, path, body) {
  return jsonRequest(`${CRM_URL}/api/qa/v1${path}`, {
    method,
    body,
    headers: { 'X-Maestro-QA-Secret': QA_SECRET },
  });
}

function crmIntegration(method, path, body) {
  return jsonRequest(`${CRM_URL}/api/integration/v1${path}`, {
    method,
    body,
    headers: {
      Authorization: `Bearer ${INTEGRATION_SECRET}`,
      'X-Integration-System': 'learning-platform',
    },
  });
}

async function appRequest(token, method, path, body) {
  return jsonRequest(`${APP_URL}${path}`, {
    method,
    body,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

async function login(loginName) {
  const payload = await appRequest(null, 'POST', '/auth/login', {
    phone: loginName,
    password: PASSWORD,
    profile: 'staff',
  });
  assert(payload.data?.token, `Login failed for ${loginName}`);
  return payload.data.token;
}

function dateWithOffset(offset) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Aqtobe',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function classesFrom(payload) {
  const data = payload?.data ?? payload;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.classes)) return data.classes;
  return [];
}

async function waitFor(label, check, timeoutMs = 12_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const value = await check();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`${label} did not become true${lastError ? `: ${lastError.message}` : ''}`);
}

async function main() {
  const suffix = String(Date.now()).slice(-8);
  const range = `?from=${dateWithOffset(-2)}&to=${dateWithOffset(7)}`;

  const status = await qaController('GET', '/status');
  assert(status.data?.environment?.database === 'maestro_crm_regression', 'CRM controller is not connected to maestro_crm_regression');
  await qaController('POST', '/reset', {});
  console.log('✓ QA controller is isolated and prior QA-RUN lessons were reset');

  const teacher1Token = await login('qa_teacher_1');
  const teacher2Token = await login('qa_teacher_2');
  const adminToken = await login('qa_admin');
  console.log('✓ QA teacher, substitute and admin accounts can sign in');

  const held = await qaController('POST', '/lessons', {
    scenarioId: `HELD-${suffix}`,
    classType: 'individual',
    studentId: 'QA-STUDENT-1',
    teacherId: 'QA-TEACHER-1',
    date: dateWithOffset(-1),
    startTime: '10:00',
    endTime: '11:00',
    title: 'QA Сквозной индивидуальный урок',
  });
  const heldId = held.data.class.crmClassId;

  const crmTeacherAgenda = await crmIntegration('GET', `/teachers/QA-TEACHER-1/offline-classes${range}`);
  assert(classesFrom(crmTeacherAgenda).some((item) => item.crmClassId === heldId), 'CRM source agenda does not contain the created lesson');
  const appTeacherAgenda = await appRequest(teacher1Token, 'GET', `/teachers/me/offline-lessons${range}`);
  assert(classesFrom(appTeacherAgenda).some((item) => item.crmClassId === heldId), 'Learning Platform did not load the CRM lesson');
  console.log('✓ A CRM-created lesson appears in the teacher application');

  await appRequest(teacher1Token, 'POST', `/teachers/me/offline-lessons/${heldId}/start`, {});
  await appRequest(teacher1Token, 'POST', `/teachers/me/offline-lessons/${heldId}/attendance`, {
    studentId: 'QA-STUDENT-1',
    attended: true,
    attendanceStatus: 'present',
    teacherNote: 'QA: ученик присутствовал.',
    lessonPoints: 0,
    homeworkReview: { status: 'not_assigned' },
  });
  await appRequest(teacher1Token, 'POST', `/teachers/me/offline-lessons/${heldId}/finish`, {
    comment: 'QA: урок завершён через приложение.',
  });
  await appRequest(teacher1Token, 'POST', `/teachers/me/offline-lessons/${heldId}/submit`, {
    topic: 'QA сквозная тема урока',
    lessonSummary: 'QA: ученик выполнил план занятия.',
    homeworkDraft: 'QA: повторить упражнение к следующему уроку.',
    teacherOutcomeHint: 'held',
  });

  await waitFor('CRM pending review state', async () => {
    const card = await crmIntegration('GET', `/classes/${heldId}`);
    return card.data?.status === 'pending_admin_review' ? card : null;
  });
  const pending = await appRequest(adminToken, 'GET', '/admin/offline-lessons/pending-review');
  assert(classesFrom(pending).some((item) => item.crmClassId === heldId), 'Admin pending-review queue does not contain submitted lesson');
  console.log('✓ Teacher conducted and submitted the lesson; admin received it');

  await appRequest(adminToken, 'POST', `/admin/offline-lessons/${heldId}/approve`, {
    deduct: false,
    teacherComment: 'QA: отчёт подтверждён без списания.',
  });
  await waitFor('CRM completed state', async () => {
    const card = await crmIntegration('GET', `/classes/${heldId}`);
    return card.data?.status === 'completed' ? card : null;
  });
  console.log('✓ Admin approved the report and CRM closed the lesson');

  const cancelled = await qaController('POST', '/lessons', {
    scenarioId: `CANCEL-${suffix}`,
    classType: 'individual',
    studentId: 'QA-STUDENT-1',
    date: dateWithOffset(2),
    startTime: '12:00',
    endTime: '13:00',
  });
  const cancelledId = cancelled.data.class.crmClassId;
  await qaController('POST', `/lessons/${cancelledId}/cancel`, { reason: 'QA cancellation lifecycle' });
  const cancelledCard = await crmIntegration('GET', `/classes/${cancelledId}`);
  assert(cancelledCard.data?.status === 'cancelled', 'Cancelled lesson did not remain in CRM history');
  console.log('✓ Cancellation keeps the lesson in CRM history with cancelled status');

  const moved = await qaController('POST', '/lessons', {
    scenarioId: `MOVE-${suffix}`,
    classType: 'group',
    groupId: 'QA-GROUP-1',
    date: dateWithOffset(2),
    startTime: '18:00',
    endTime: '19:30',
  });
  const movedId = moved.data.class.crmClassId;
  await qaController('PATCH', `/lessons/${movedId}/reschedule`, {
    date: dateWithOffset(4),
    startTime: '17:30',
    endTime: '19:00',
  });
  const movedAgenda = await appRequest(teacher1Token, 'GET', `/teachers/me/offline-lessons${range}`);
  const movedInApp = classesFrom(movedAgenda).find((item) => item.crmClassId === movedId);
  assert(movedInApp?.startTime === '17:30', 'Rescheduled time did not reach Learning Platform');
  console.log('✓ Rescheduled CRM time is visible in Learning Platform');

  await qaController('PATCH', '/groups/QA-GROUP-1/roster', {
    studentId: 'QA-STUDENT-3',
    state: 'left',
  });
  const rosterWithoutStudent = await crmIntegration('GET', `/classes/${movedId}/students`);
  assert(
    !rosterWithoutStudent.data?.students?.some((item) => item.crmStudentId === 'QA-STUDENT-3'),
    'Removed group student is still present in the future lesson roster',
  );
  await qaController('PATCH', '/groups/QA-GROUP-1/roster', {
    studentId: 'QA-STUDENT-3',
    state: 'active',
  });
  const restoredRoster = await crmIntegration('GET', `/classes/${movedId}/students`);
  assert(
    restoredRoster.data?.students?.some((item) => item.crmStudentId === 'QA-STUDENT-3'),
    'Restored group student did not return to the future lesson roster',
  );
  console.log('✓ Group roster removal and restoration propagate to the future lesson');

  await qaController('PATCH', `/lessons/${movedId}/substitute`, { teacherId: 'QA-TEACHER-2' });
  const substituteAgenda = await appRequest(teacher2Token, 'GET', `/teachers/me/offline-lessons${range}`);
  assert(classesFrom(substituteAgenda).some((item) => item.crmClassId === movedId), 'One-off substitute cannot see the assigned lesson');
  const originalAgenda = await appRequest(teacher1Token, 'GET', `/teachers/me/offline-lessons${range}`);
  assert(!classesFrom(originalAgenda).some((item) => item.crmClassId === movedId), 'Original teacher still sees a one-off replacement lesson');
  console.log('✓ One-off replacement grants only the substitute access to that lesson');

  console.log('\nQA CRM lifecycle passed. Created fixtures:');
  console.log(`- completed: ${heldId}`);
  console.log(`- cancelled: ${cancelledId}`);
  console.log(`- rescheduled with substitute: ${movedId}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
