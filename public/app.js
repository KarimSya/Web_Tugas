const state = {
  user: null,
  tasks: [],
  allTasks: [],
  courses: [],
  status: 'all',
  courseId: '',
  query: '',
  view: 'all',
};

const $ = (selector) => document.querySelector(selector);
const authScreen = $('#auth-screen');
const appScreen = $('#app-screen');
const authForm = $('#auth-form');
const taskDialog = $('#task-dialog');
const taskForm = $('#task-form');
let toastTimer;

async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || 'Permintaan gagal. Coba lagi.');
    error.status = response.status;
    throw error;
  }
  return data;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 3000);
}

function setAuthMode(register) {
  authForm.dataset.mode = register ? 'register' : 'login';
  $('#name-field').classList.toggle('hidden', !register);
  $('#name-field input').required = register;
  $('#auth-eyebrow').textContent = register ? 'MULAI ATUR SEMESTERMU' : 'SELAMAT DATANG KEMBALI';
  $('#auth-title').textContent = register ? 'Buat akun baru' : 'Masuk ke akunmu';
  $('#auth-subtitle').textContent = register
    ? 'Buat ruang pribadi untuk semua tugas kuliahmu.'
    : 'Lanjutkan mengatur tugas kuliahmu.';
  $('#auth-submit').textContent = register ? 'Buat akun' : 'Masuk';
  $('#auth-switch-copy').textContent = register ? 'Sudah punya akun?' : 'Belum punya akun?';
  $('#auth-switch').textContent = register ? 'Masuk' : 'Daftar sekarang';
  authForm.elements.password.autocomplete = register ? 'new-password' : 'current-password';
  $('#auth-error').textContent = '';
}

function showAuth(message = '') {
  state.user = null;
  state.tasks = [];
  state.allTasks = [];
  state.courses = [];
  state.status = 'all';
  state.courseId = '';
  state.query = '';
  state.view = 'all';
  $('#task-list').replaceChildren();
  $('#course-nav').replaceChildren();
  $('#search').value = '';
  $('#course-filter').value = '';
  $('#stat-total').textContent = '0';
  $('#stat-upcoming').textContent = '0';
  $('#stat-completed').textContent = '0';
  appScreen.classList.add('hidden');
  authScreen.classList.remove('hidden');
  $('#auth-error').textContent = message;
}

function showApp(user) {
  state.user = user;
  authScreen.classList.add('hidden');
  appScreen.classList.remove('hidden');
  $('#profile-name').textContent = user.name;
  $('#avatar').textContent = (user.name.trim()[0] || 'R').toUpperCase();
  $('#welcome-title').textContent = `Halo, ${user.name.split(' ')[0]}!`;
  $('#today-label').textContent = new Intl.DateTimeFormat('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long',
  }).format(new Date()).toLocaleUpperCase('id-ID');
}

function setView(view) {
  state.view = view;
  state.courseId = view.startsWith('course:') ? view.slice(7) : '';
  if (view === 'active' || view === 'completed') state.status = view;
  else if (view === 'all' || view.startsWith('course:')) state.status = 'all';
  $('#status-filter').value = state.status;
  document.querySelectorAll('.nav-item').forEach((button) => {
    button.classList.toggle('active', button.dataset.view === view);
  });
  document.querySelectorAll('.course-filter').forEach((button) => {
    button.classList.toggle('active', view === `course:${button.dataset.courseId}`);
  });
  const course = state.courses.find((item) => String(item.id) === state.courseId);
  const heading = course ? course.course_name
    : view === 'active' ? 'Tugas aktif'
      : view === 'completed' ? 'Tugas selesai' : 'Ringkasan';
  $('#page-heading').textContent = heading;
  $('#tasks-heading').textContent = course ? `Tugas ${course.course_name}`
    : view === 'active' ? 'Tugas aktif'
      : view === 'completed' ? 'Tugas selesai' : 'Tugasmu';
  loadTasks().catch(handleError);
}

async function loadDashboard() {
  const [courseData] = await Promise.all([api('/courses')]);
  state.courses = courseData.courses;
  renderCourses();
  await loadTasks();
  updateNotificationButton();
}

async function loadTasks() {
  const params = new URLSearchParams();
  if (state.courseId) params.set('courseId', state.courseId);
  if (state.status !== 'all') params.set('status', state.status);
  if (state.query) params.set('q', state.query);
  const [allData, filteredData] = await Promise.all([
    api('/tasks'),
    api(`/tasks?${params}`),
  ]);
  state.allTasks = allData.tasks;
  const data = filteredData;
  state.tasks = data.tasks;
  renderTasks();
  renderStats();
}

function renderCourses() {
  const courseNav = $('#course-nav');
  courseNav.innerHTML = state.courses.map((course) => {
    const count = state.allTasks.filter((task) => String(task.course_id) === String(course.id)).length;
    return `<div class="course-filter-row">
      <button class="course-filter ${state.view === `course:${course.id}` ? 'active' : ''}" type="button" data-course-id="${escapeHtml(course.id)}">
        <span class="course-swatch" style="--course-color:${escapeHtml(course.color_code)}"></span>
        <span class="course-name">${escapeHtml(course.course_name)}</span><span class="course-count">${count}</span>
      </button>
      <button class="course-edit" type="button" data-edit-course="${escapeHtml(course.id)}" aria-label="Ubah ${escapeHtml(course.course_name)}" title="Ubah mata kuliah">✎</button>
    </div>`;
  }).join('');
  const currentCourse = state.courseId;
  $('#course-filter').innerHTML = '<option value="">Semua mata kuliah</option>' +
    state.courses.map((course) => `<option value="${escapeHtml(course.id)}">${escapeHtml(course.course_name)}</option>`).join('');
  $('#course-filter').value = state.courses.some((course) => String(course.id) === currentCourse) ? currentCourse : '';
  taskForm.elements.courseId.innerHTML = state.courses.map((course) =>
    `<option value="${escapeHtml(course.id)}">${escapeHtml(course.course_name)}</option>`).join('');
}

function renderStats() {
  const all = state.allTasks;
  const completed = all.filter((task) => task.is_completed).length;
  const upcoming = all.filter((task) => !task.is_completed && new Date(task.deadline) > new Date()
    && new Date(task.deadline) <= new Date(Date.now() + 24 * 60 * 60 * 1000)).length;
  $('#stat-total').textContent = all.length;
  $('#stat-upcoming').textContent = upcoming;
  $('#stat-completed').textContent = completed;
  $('#task-count').textContent = `${all.length} ${all.length === 1 ? 'tugas' : 'tugas'}`;
  renderCourses();
}

function getDeadlineInfo(deadline, completed) {
  const date = new Date(deadline);
  if (completed) {
    return { label: 'Selesai', tone: 'safe', absolute: formatDate(date) };
  }
  const remaining = date.getTime() - Date.now();
  if (remaining < 0) return { label: 'Terlambat', tone: 'urgent', absolute: formatDate(date) };
  if (remaining <= 3 * 60 * 60 * 1000) {
    const hours = Math.max(1, Math.ceil(remaining / (60 * 60 * 1000)));
    return { label: `${hours} jam lagi`, tone: 'urgent', absolute: formatDate(date) };
  }
  if (remaining <= 24 * 60 * 60 * 1000) {
    const hours = Math.ceil(remaining / (60 * 60 * 1000));
    return { label: `${hours} jam lagi`, tone: 'soon', absolute: formatDate(date) };
  }
  return { label: formatDate(date), tone: 'safe', absolute: 'Deadline' };
}

function formatDate(date) {
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  }).format(date);
}

function renderTasks() {
  const list = $('#task-list');
  if (!state.tasks.length) {
    list.innerHTML = `<div class="empty-state">
      <span class="empty-illustration">✦</span>
      <strong>${state.query || state.courseId || state.status !== 'all' ? 'Belum ada tugas di sini' : 'Ruangmu masih lega'}</strong>
      <p>${state.query ? 'Coba kata kunci lain atau bersihkan pencarian.' : 'Tambahkan tugas kuliah dan deadline pertamamu.'}</p>
      ${!state.query && state.status !== 'completed' ? '<button id="empty-add-task" class="button button-primary" type="button">+ Buat tugas</button>' : ''}
    </div>`;
    $('#empty-add-task')?.addEventListener('click', () => openTaskDialog());
    return;
  }
  list.innerHTML = state.tasks.map((task) => {
    const deadline = getDeadlineInfo(task.deadline, task.is_completed);
    const priorityLabel = { high: 'TINGGI', medium: 'SEDANG', low: 'RENDAH' }[task.priority];
    return `<article class="task-row ${task.is_completed ? 'completed' : ''}" data-task-id="${escapeHtml(task.id)}">
      <button class="task-check ${task.is_completed ? 'is-complete' : ''}" type="button" data-action="toggle" aria-label="${task.is_completed ? 'Tandai belum selesai' : 'Tandai selesai'}">${task.is_completed ? '✓' : ''}</button>
      <div class="task-main">
        <div class="task-title-line">
          <span class="task-title">${escapeHtml(task.title)}</span>
          <span class="priority-badge priority-${escapeHtml(task.priority)}">${priorityLabel}</span>
        </div>
        <div class="task-meta">
          <span class="course-tag"><span class="course-swatch" style="--course-color:${escapeHtml(task.color_code)}"></span>${escapeHtml(task.course_name)}</span>
          ${task.description ? `<span aria-hidden="true">·</span><span class="task-description">${escapeHtml(task.description)}</span>` : ''}
        </div>
      </div>
      <div class="task-side">
        <span class="deadline-label ${deadline.tone}" title="${escapeHtml(deadline.absolute)}">${escapeHtml(deadline.label)}</span>
        <div class="task-actions">
          <button class="icon-button" type="button" data-action="edit" aria-label="Edit tugas" title="Edit">✎</button>
          <button class="icon-button" type="button" data-action="delete" aria-label="Hapus tugas" title="Hapus">×</button>
        </div>
      </div>
    </article>`;
  }).join('');
}

function toLocalInputValue(value) {
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function openTaskDialog(task = null) {
  $('#dialog-title').textContent = task ? 'Edit tugas' : 'Buat tugas baru';
  taskForm.elements.taskId.value = task ? task.id : '';
  taskForm.elements.title.value = task ? task.title : '';
  taskForm.elements.description.value = task ? task.description : '';
  taskForm.elements.courseId.value = task ? task.course_id : (state.courses[0]?.id || '');
  taskForm.elements.priority.value = task ? task.priority : 'medium';
  taskForm.elements.deadline.value = task ? toLocalInputValue(task.deadline) : '';
  $('#task-form-error').textContent = '';
  taskDialog.showModal();
  taskForm.elements.title.focus();
}

async function handleTaskSubmit(event) {
  event.preventDefault();
  const formData = new FormData(taskForm);
  const taskId = formData.get('taskId');
  const deadline = new Date(formData.get('deadline'));
  if (Number.isNaN(deadline.getTime()) || deadline <= new Date()) {
    $('#task-form-error').textContent = 'Pilih deadline di waktu mendatang.';
    return;
  }
  const task = {
    title: formData.get('title').trim(),
    description: formData.get('description').trim(),
    courseId: Number(formData.get('courseId')),
    priority: formData.get('priority'),
    deadline: deadline.toISOString(),
  };
  try {
    await api(taskId ? `/tasks/${taskId}` : '/tasks', {
      method: taskId ? 'PATCH' : 'POST',
      body: JSON.stringify(task),
    });
    taskDialog.close();
    await loadTasks();
    showToast(taskId ? 'Perubahan tugas tersimpan.' : 'Tugas berhasil ditambahkan.');
  } catch (error) {
    $('#task-form-error').textContent = error.message;
  }
}

async function handleTaskAction(event) {
  const button = event.target.closest('[data-action]');
  const row = event.target.closest('[data-task-id]');
  if (!button || !row) return;
  const task = state.tasks.find((item) => String(item.id) === row.dataset.taskId);
  if (!task) return;
  try {
    if (button.dataset.action === 'toggle') {
      await api(`/tasks/${task.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isCompleted: !task.is_completed }),
      });
      showToast(task.is_completed ? 'Tugas ditandai aktif.' : 'Tugas selesai. Kerja bagus!');
    } else if (button.dataset.action === 'edit') {
      openTaskDialog(task);
      return;
    } else if (button.dataset.action === 'delete') {
      if (!window.confirm(`Hapus tugas "${task.title}"?`)) return;
      await api(`/tasks/${task.id}`, { method: 'DELETE' });
      showToast('Tugas dihapus.');
    }
    await loadTasks();
  } catch (error) {
    handleError(error);
  }
}

async function addCourse() {
  const courseName = window.prompt('Nama mata kuliah baru:');
  if (!courseName || !courseName.trim()) return;
  const colors = ['#6c63ff', '#f97316', '#0ea5e9', '#ec4899', '#14b8a6', '#8b5cf6', '#eab308', '#ef4444', '#22c55e'];
  const colorCode = colors[state.courses.length % colors.length];
  try {
    const result = await api('/courses', {
      method: 'POST',
      body: JSON.stringify({ courseName: courseName.trim(), colorCode }),
    });
    state.courses.push(result.course);
    renderCourses();
    showToast('Mata kuliah berhasil ditambahkan.');
  } catch (error) {
    handleError(error);
  }
}

async function editCourse(courseId) {
  const course = state.courses.find((item) => String(item.id) === String(courseId));
  if (!course) return;
  const courseName = window.prompt('Nama mata kuliah:', course.course_name);
  if (courseName === null || !courseName.trim()) return;
  const colorCode = window.prompt('Warna kategori dalam format HEX (contoh #6c63ff):', course.color_code);
  if (colorCode === null) return;
  if (!/^#[0-9a-fA-F]{6}$/.test(colorCode.trim())) {
    showToast('Gunakan kode warna HEX, misalnya #6c63ff.');
    return;
  }
  try {
    const result = await api(`/courses/${course.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ courseName: courseName.trim(), colorCode: colorCode.trim() }),
    });
    state.courses = state.courses.map((item) => item.id === course.id ? result.course : item);
    renderCourses();
    if (state.view === `course:${course.id}`) {
      $('#page-heading').textContent = result.course.course_name;
      $('#tasks-heading').textContent = `Tugas ${result.course.course_name}`;
    }
    showToast('Mata kuliah berhasil diperbarui.');
  } catch (error) {
    handleError(error);
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((character) => character.charCodeAt(0)));
}

async function updateNotificationButton() {
  const button = $('#notification-button');
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    button.title = 'Browser ini tidak mendukung notifikasi web.';
    button.disabled = true;
    return;
  }
  try {
    await navigator.serviceWorker.register('/sw.js');
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    button.dataset.enabled = String(Boolean(subscription));
    button.textContent = subscription ? '✓ Notifikasi aktif' : '♧ Aktifkan notifikasi';
    button.classList.toggle('button-soft', !subscription);
    button.classList.toggle('button-primary', Boolean(subscription));
  } catch (error) {
    console.error('Service worker registration failed:', error);
    button.title = 'Service Worker tidak dapat didaftarkan.';
  }
}

async function enableNotifications() {
  if (!('Notification' in window)) {
    showToast('Browser ini tidak mendukung notifikasi.');
    return;
  }
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      showToast('Izin notifikasi belum diberikan di pengaturan browser.');
      return;
    }
    const { publicKey } = await api('/push/vapid-public-key');
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }
    await api('/push/subscription', {
      method: 'POST',
      body: JSON.stringify(subscription),
    });
    await updateNotificationButton();
    showToast('Notifikasi pengingat berhasil diaktifkan.');
  } catch (error) {
    handleError(error);
  }
}

async function disableNotifications() {
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await api('/push/subscription', {
        method: 'DELETE',
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });
      await subscription.unsubscribe();
    }
    await updateNotificationButton();
    showToast('Notifikasi di perangkat ini dinonaktifkan.');
  } catch (error) {
    handleError(error);
  }
}

function handleError(error) {
  if (error.status === 401) {
    showAuth('Sesi berakhir. Silakan masuk kembali.');
  } else {
    showToast(error.message || 'Terjadi kesalahan. Coba lagi.');
  }
}

function applyTheme(dark) {
  document.body.classList.toggle('dark', dark);
  $('#theme-toggle').textContent = dark ? '☀' : '☾';
  localStorage.setItem('ruangtugas-theme', dark ? 'dark' : 'light');
}

authForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const register = authForm.dataset.mode === 'register';
  const data = Object.fromEntries(new FormData(authForm));
  $('#auth-error').textContent = '';
  try {
    const result = await api(`/auth/${register ? 'register' : 'login'}`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    showApp(result.user);
  } catch (error) {
    $('#auth-error').textContent = error.message;
    return;
  }
  try {
    await loadDashboard();
  } catch (error) {
    handleError(error);
  }
});

$('#auth-switch').addEventListener('click', () => {
  setAuthMode(authForm.dataset.mode !== 'register');
});
$('#logout').addEventListener('click', async () => {
  try {
    await api('/auth/logout', { method: 'POST' });
    showAuth();
    setAuthMode(false);
  } catch (error) {
    handleError(error);
  }
});
$('#new-task').addEventListener('click', () => openTaskDialog());
$('#add-course').addEventListener('click', addCourse);
$('#task-list').addEventListener('click', handleTaskAction);
taskForm.addEventListener('submit', handleTaskSubmit);
taskDialog.addEventListener('click', (event) => {
  if (event.target.matches('[data-close]')) taskDialog.close();
});
document.querySelectorAll('[data-close]').forEach((button) =>
  button.addEventListener('click', () => taskDialog.close()));
document.querySelectorAll('.nav-item').forEach((button) =>
  button.addEventListener('click', () => setView(button.dataset.view)));
$('#course-nav').addEventListener('click', (event) => {
  const editButton = event.target.closest('[data-edit-course]');
  if (editButton) {
    editCourse(editButton.dataset.editCourse);
    return;
  }
  const button = event.target.closest('[data-course-id]');
  if (button) setView(`course:${button.dataset.courseId}`);
});
$('#status-filter').addEventListener('change', (event) => {
  state.status = event.target.value;
  state.view = state.status;
  setView(state.status);
});
$('#course-filter').addEventListener('change', (event) => {
  state.courseId = event.target.value;
  state.view = state.courseId ? `course:${state.courseId}` : 'all';
  setView(state.view);
});
$('#search').addEventListener('input', (event) => {
  clearTimeout(window.searchTimer);
  state.query = event.target.value.trim();
  window.searchTimer = setTimeout(() => loadTasks().catch(handleError), 250);
});
$('#theme-toggle').addEventListener('click', () =>
  applyTheme(!document.body.classList.contains('dark')));
$('#notification-button').addEventListener('click', () =>
  $('#notification-button').dataset.enabled === 'true'
    ? disableNotifications()
    : enableNotifications());

applyTheme(localStorage.getItem('ruangtugas-theme') === 'dark');
setAuthMode(false);
api('/auth/me')
  .then(async ({ user }) => {
    showApp(user);
    await loadDashboard();
  })
  .catch((error) => {
    showAuth(error.status === 401 ? '' : error.message);
  });
