let API_URL = window.API_BASE || window.location.origin;
let currentAdminKey = sessionStorage.getItem('academy_admin_key') || '';
let currentFilter = 'PENDING';
let paymentsData = [];
let adminMethodsData = [];
let uploadedAdminQrBase64 = null;

// Init on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  initAuth();
  initNavigation();
  initModals();
  initSearch();
  initForms();
  initAdminQrUpload();
});

function initAuth() {
  const authModal = document.getElementById('authModal');
  const authForm = document.getElementById('authForm');
  const adminKeyInput = document.getElementById('adminKeyInput');
  const authError = document.getElementById('authError');
  const logoutBtn = document.getElementById('logoutBtn');
  const togglePasswordBtn = document.getElementById('togglePasswordBtn');
  const authSubmitBtn = document.getElementById('authSubmitBtn');
  const backendApiInput = document.getElementById('backendApiInput');
  const studentFormLink = document.getElementById('studentFormLink');

  // Handle dynamic student form link
  if (studentFormLink) {
    studentFormLink.addEventListener('click', (e) => {
      e.preventDefault();
      const targetUrl = window.STUDENT_PORTAL_URL || 'https://academic-student-portal.vercel.app';
      window.open(targetUrl, '_blank');
    });
  }

  // Prepopulate backend API input
  const storedUrl = localStorage.getItem('ACADEMY_BACKEND_URL');
  if (backendApiInput) {
    backendApiInput.value = storedUrl || (window.API_BASE && window.API_BASE !== window.location.origin ? window.API_BASE : '');
    backendApiInput.addEventListener('change', () => {
      const customApi = backendApiInput.value.trim().replace(/\/+$/, '');
      if (customApi) {
        localStorage.setItem('ACADEMY_BACKEND_URL', customApi);
        API_URL = customApi;
        window.API_BASE = customApi;
      } else {
        localStorage.removeItem('ACADEMY_BACKEND_URL');
        API_URL = window.location.origin;
        window.API_BASE = window.location.origin;
      }
    });
  }

  // Toggle Password visibility
  togglePasswordBtn?.addEventListener('click', () => {
    if (adminKeyInput.type === 'password') {
      adminKeyInput.type = 'text';
      togglePasswordBtn.textContent = '🔒 Hide Key';
    } else {
      adminKeyInput.type = 'password';
      togglePasswordBtn.textContent = '👁️ Show Key';
    }
  });

  if (!currentAdminKey) {
    authModal.classList.remove('hidden');
  } else {
    // Validate stored key
    fetch(`${API_URL}/api/admin/verify`, { headers: { 'x-admin-key': currentAdminKey } })
      .then((res) => {
        if (!res.ok) throw new Error('Key expired');
        authModal.classList.add('hidden');
        loadDashboard();
      })
      .catch(() => {
        sessionStorage.removeItem('academy_admin_key');
        currentAdminKey = '';
        authModal.classList.remove('hidden');
      });
  }

  authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    authError.classList.add('hidden');
    let key = adminKeyInput.value.trim().replace(/^["']|["']$/g, '');
    if (!key) return;

    // Apply backend API URL if specified
    if (backendApiInput) {
      const customApi = backendApiInput.value.trim().replace(/\/+$/, '');
      if (customApi) {
        localStorage.setItem('ACADEMY_BACKEND_URL', customApi);
        API_URL = customApi;
        window.API_BASE = customApi;
      } else if (storedUrl) {
        localStorage.removeItem('ACADEMY_BACKEND_URL');
        API_URL = window.location.origin;
        window.API_BASE = window.location.origin;
      }
    }

    if (authSubmitBtn) {
      authSubmitBtn.disabled = true;
      authSubmitBtn.textContent = 'Verifying...';
    }

    try {
      const res = await fetch(`${API_URL}/api/admin/verify`, {
        headers: { 'x-admin-key': key },
      });

      if (!res.ok) {
        throw new Error('Unauthorized');
      }

      currentAdminKey = key;
      sessionStorage.setItem('academy_admin_key', key);
      authModal.classList.add('hidden');
      loadDashboard();
    } catch (err) {
      authError.textContent = (err && err.message === 'Unauthorized')
        ? 'Invalid Admin Access Key'
        : `Connection Error: Unable to reach backend at ${API_URL}. Check backend URL and server status.`;
      authError.classList.remove('hidden');
    } finally {
      if (authSubmitBtn) {
        authSubmitBtn.disabled = false;
        authSubmitBtn.textContent = 'Unlock Dashboard';
      }
    }
  });

  logoutBtn.addEventListener('click', () => {
    sessionStorage.removeItem('academy_admin_key');
    window.location.reload();
  });
}

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    'x-admin-key': currentAdminKey,
  };
}

async function loadDashboard() {
  loadStats();
  loadPayments();
  loadAdminPaymentMethods();
}

async function loadStats() {
  try {
    const res = await fetch(`${API_URL}/api/admin/stats`, { headers: authHeaders() });
    if (!res.ok) return;
    const json = await res.json();
    const s = json.stats;

    document.getElementById('statPending').textContent = s.pendingPayments;
    document.getElementById('statActive').textContent = s.activeSubscribers;
    document.getElementById('statRevenue').textContent = `$${s.totalManualRevenue.toFixed(2)}`;
    document.getElementById('statTotalUsers').textContent = s.totalUsers;

    const t = s.tierDistribution;
    document.getElementById('statTiers').textContent = `T1: ${t.tier1} • T2: ${t.tier2} • T3: ${t.tier3} • Grad: ${t.graduates}`;

    const badge = document.getElementById('pendingBadge');
    const pillCount = document.getElementById('pillPendingCount');
    if (s.pendingPayments > 0) {
      badge.textContent = s.pendingPayments;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
    pillCount.textContent = s.pendingPayments;
  } catch (err) {
    console.error('Error loading stats:', err);
  }
}

async function loadPayments() {
  const tbody = document.getElementById('paymentsTableBody');
  tbody.innerHTML = '<tr><td colspan="9" class="empty-state">Loading payment proofs...</td></tr>';

  try {
    const searchVal = document.getElementById('paymentSearchInput').value.trim();
    let url = `${API_URL}/api/admin/manual-payments?status=${currentFilter}`;
    if (searchVal) {
      url += `&search=${encodeURIComponent(searchVal)}`;
    }

    const res = await fetch(url, { headers: authHeaders() });
    const json = await res.json();

    if (!res.ok) throw new Error(json.error || 'Failed to fetch payments');

    paymentsData = json.data;
    renderPaymentsTable(paymentsData);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="9" class="empty-state">Error: ${err.message}</td></tr>`;
  }
}

function renderPaymentsTable(payments) {
  const tbody = document.getElementById('paymentsTableBody');

  if (payments.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty-state">No payment proofs found for this filter.</td></tr>';
    return;
  }

  tbody.innerHTML = payments
    .map((p) => {
      const dateStr = new Date(p.createdAt).toLocaleDateString() + ' ' + new Date(p.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      
      const proofLink = p.proofUrl
        ? `<button class="btn-table btn-view" onclick="openImageZoom('${escapeHtml(p.proofUrl)}', 'Receipt - ${escapeHtml(p.studentName)}')">👁️ View Receipt</button>`
        : '<span style="color: #64748b;">No Image</span>';

      const actionButtons =
        p.status === 'PENDING'
          ? `<div class="action-buttons">
              <button class="btn-table btn-approve" onclick="openApproveModal('${p.id}')">✅ Approve</button>
              <button class="btn-table btn-reject" onclick="openRejectModal('${p.id}')">❌ Reject</button>
             </div>`
          : `<span style="color: #64748b;">${p.reviewedBy ? `by ${p.reviewedBy}` : 'Processed'}</span>`;

      return `
        <tr>
          <td><span style="font-size: 0.78rem; color: #94a3b8;">${dateStr}</span></td>
          <td><strong>${escapeHtml(p.studentName)}</strong></td>
          <td><code>${escapeHtml(p.phoneNumber)}</code></td>
          <td><code>${escapeHtml(p.transactionId)}</code></td>
          <td><strong style="color: #22c55e;">$${p.amount.toFixed(2)}</strong></td>
          <td><span style="font-size: 0.8rem;">${escapeHtml(p.paymentMethod)}</span></td>
          <td>${proofLink}</td>
          <td><span class="status-tag ${p.status}">${p.status}</span></td>
          <td>${actionButtons}</td>
        </tr>
      `;
    })
    .join('');
}

function initNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  const tabs = document.querySelectorAll('.tab-pane');
  const pageTitle = document.getElementById('pageTitle');

  navItems.forEach((btn) => {
    btn.addEventListener('click', () => {
      navItems.forEach((n) => n.classList.remove('active'));
      tabs.forEach((t) => t.classList.remove('active'));

      btn.classList.add('active');
      const targetTab = document.getElementById(btn.dataset.tab);
      if (targetTab) targetTab.classList.add('active');

      if (btn.dataset.tab === 'paymentsTab') {
        pageTitle.textContent = 'Manual Payment Verification Queue';
        loadPayments();
      } else if (btn.dataset.tab === 'methodsTab') {
        pageTitle.textContent = 'QR & Direct Payment Methods';
        loadAdminPaymentMethods();
      } else if (btn.dataset.tab === 'studentsTab') {
        pageTitle.textContent = 'Student Directory & Access Management';
        loadStudents();
      } else if (btn.dataset.tab === 'auditTab') {
        pageTitle.textContent = 'Immutable Audit Trail & System Logs';
        loadAuditLogs();
      }
    });
  });

  // Filter Pills
  document.querySelectorAll('.filter-pills .pill').forEach((pill) => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.filter-pills .pill').forEach((p) => p.classList.remove('active'));
      pill.classList.add('active');
      currentFilter = pill.dataset.filter;
      loadPayments();
    });
  });
}

function initSearch() {
  const paymentSearch = document.getElementById('paymentSearchInput');
  let debounceTimeout;

  paymentSearch.addEventListener('input', () => {
    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => {
      loadPayments();
    }, 300);
  });

  const studentSearch = document.getElementById('studentSearchInput');
  if (studentSearch) {
    studentSearch.addEventListener('input', () => {
      clearTimeout(debounceTimeout);
      debounceTimeout = setTimeout(() => {
        loadStudents();
      }, 300);
    });
  }
}

function initModals() {
  document.getElementById('openDirectPaymentBtn')?.addEventListener('click', () => {
    document.getElementById('directPaymentForm').reset();
    openModal('directPaymentModal');
  });

  document.getElementById('openNewMethodBtn')?.addEventListener('click', () => {
    openMethodModal();
  });

  document.getElementById('addMethodBtn')?.addEventListener('click', () => {
    openMethodModal();
  });
}

function openModal(modalId) {
  document.getElementById(modalId)?.classList.remove('hidden');
}

function closeModal(modalId) {
  document.getElementById(modalId)?.classList.add('hidden');
}

// Payment Methods Admin Logic
async function loadAdminPaymentMethods() {
  const grid = document.getElementById('adminMethodsGrid');
  const loading = document.getElementById('methodsAdminLoading');
  const empty = document.getElementById('noAdminMethodsAlert');
  const badge = document.getElementById('methodsBadge');

  loading.classList.remove('hidden');
  grid.classList.add('hidden');
  empty.classList.add('hidden');

  try {
    const res = await fetch(`${API_URL}/api/admin/payment-methods`, { headers: authHeaders() });
    const json = await res.json();

    loading.classList.add('hidden');
    if (!res.ok) throw new Error(json.error || 'Failed to load methods');

    adminMethodsData = json.data || [];

    if (badge) {
      badge.textContent = adminMethodsData.length;
      badge.classList.remove('hidden');
    }

    if (adminMethodsData.length === 0) {
      empty.classList.remove('hidden');
      return;
    }

    grid.innerHTML = '';
    adminMethodsData.forEach((m) => {
      const card = document.createElement('div');
      card.className = `admin-method-card ${m.active ? '' : 'inactive'}`;

      const qrThumb = m.qrCodeUrl
        ? `<div class="admin-qr-thumb" onclick="openImageZoom('${escapeHtml(m.qrCodeUrl)}', '${escapeHtml(m.title)} QR Code')">
             <img src="${m.qrCodeUrl}" alt="QR">
           </div>`
        : `<div class="admin-no-qr-thumb">
             <span>💳</span>
             <span>No QR Image</span>
           </div>`;

      const accountNameHtml = m.accountName
        ? `<div class="admin-info-item">
             <div class="admin-info-label">Account Name</div>
             <div class="admin-info-value" style="font-family: inherit;">${escapeHtml(m.accountName)}</div>
           </div>`
        : '';

      const instructionsHtml = m.instructions
        ? `<div class="admin-method-instructions">💡 ${escapeHtml(m.instructions)}</div>`
        : '';

      card.innerHTML = `
        <div class="admin-method-header">
          <div class="admin-method-title">${escapeHtml(m.title)}</div>
          <button type="button" class="btn-icon-danger" onclick="deleteMethod('${m.id}', '${escapeHtml(m.title)}')">🗑️ Delete</button>
        </div>
        <div class="admin-method-body">
          ${qrThumb}
          <div class="admin-method-info">
            ${accountNameHtml}
            <div class="admin-info-item">
              <div class="admin-info-label">Account / Phone / ID</div>
              <div class="admin-info-value">${escapeHtml(m.accountNumber)}</div>
            </div>
          </div>
        </div>
        ${instructionsHtml}
        <div class="admin-method-footer">
          <div class="method-switch-wrapper">
            <label class="switch">
              <input type="checkbox" ${m.active ? 'checked' : ''} onchange="toggleMethod('${m.id}')">
              <span class="slider"></span>
            </label>
            <span>${m.active ? 'Active (Live)' : 'Inactive (Hidden)'}</span>
          </div>
        </div>
      `;

      grid.appendChild(card);
    });

    grid.classList.remove('hidden');
  } catch (err) {
    loading.classList.add('hidden');
    empty.textContent = `Error loading payment methods: ${err.message}`;
    empty.classList.remove('hidden');
  }
}

function openMethodModal() {
  const form = document.getElementById('methodForm');
  form.reset();
  uploadedAdminQrBase64 = null;
  document.getElementById('adminQrPreviewImg').src = '';
  document.getElementById('adminQrPreviewContainer').classList.add('hidden');
  document.getElementById('adminQrDropContent').classList.remove('hidden');
  document.getElementById('methodActiveCheckbox').checked = true;
  document.getElementById('editMethodId').value = '';
  openModal('methodModal');
}

function initAdminQrUpload() {
  const dropZone = document.getElementById('adminQrDropZone');
  const fileInput = document.getElementById('adminQrFileInput');
  const previewContainer = document.getElementById('adminQrPreviewContainer');
  const previewImg = document.getElementById('adminQrPreviewImg');
  const removeBtn = document.getElementById('adminQrRemoveBtn');
  const dropContent = document.getElementById('adminQrDropContent');
  const urlInput = document.getElementById('methodQrUrlInput');

  if (!dropZone || !fileInput) return;

  dropZone.addEventListener('click', () => fileInput.click());

  ['dragenter', 'dragover'].forEach(name => {
    dropZone.addEventListener(name, (e) => {
      e.preventDefault();
      dropZone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach(name => {
    dropZone.addEventListener(name, (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
    });
  });

  dropZone.addEventListener('drop', (e) => {
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleAdminQrFile(e.dataTransfer.files[0]);
    }
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      handleAdminQrFile(e.target.files[0]);
    }
  });

  removeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    uploadedAdminQrBase64 = null;
    fileInput.value = '';
    previewImg.src = '';
    previewContainer.classList.add('hidden');
    dropContent.classList.remove('hidden');
  });

  function handleAdminQrFile(file) {
    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file (PNG, JPG, WEBP).');
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      uploadedAdminQrBase64 = event.target.result;
      previewImg.src = uploadedAdminQrBase64;
      dropContent.classList.add('hidden');
      previewContainer.classList.remove('hidden');
      if (urlInput) urlInput.value = '';
    };
    reader.readAsDataURL(file);
  }
}

async function toggleMethod(id) {
  try {
    const res = await fetch(`${API_URL}/api/admin/payment-methods/${id}/toggle`, {
      method: 'PATCH',
      headers: authHeaders(),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to toggle status');
    showToast(json.message || 'Payment method status updated');
    loadAdminPaymentMethods();
  } catch (err) {
    alert('Error toggling payment method: ' + err.message);
    loadAdminPaymentMethods();
  }
}

async function deleteMethod(id, title) {
  if (!confirm(`Are you sure you want to delete payment method "${title}"?`)) {
    return;
  }

  try {
    const res = await fetch(`${API_URL}/api/admin/payment-methods/${id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to delete payment method');
    showToast('Payment method deleted successfully');
    loadAdminPaymentMethods();
  } catch (err) {
    alert('Error deleting payment method: ' + err.message);
  }
}

function openImageZoom(src, title) {
  const modal = document.getElementById('imageZoomModal');
  const img = document.getElementById('zoomImage');
  const titleEl = document.getElementById('zoomTitle');

  img.src = src;
  titleEl.textContent = title || 'Image Preview';
  openModal('imageZoomModal');
}

function openApproveModal(id) {
  const payment = paymentsData.find((p) => p.id === id);
  if (!payment) return;

  document.getElementById('approvePaymentId').value = payment.id;
  document.getElementById('approveStudentName').textContent = payment.studentName;
  document.getElementById('approvePhoneNumber').textContent = payment.phoneNumber;
  document.getElementById('approveTxId').textContent = payment.transactionId;
  document.getElementById('approveAmount').textContent = `$${payment.amount.toFixed(2)}`;
  document.getElementById('approveNotes').value = `Verified payment of $${payment.amount.toFixed(2)} (${payment.paymentMethod})`;

  openModal('approveModal');
}

function openRejectModal(id) {
  document.getElementById('rejectPaymentId').value = id;
  document.getElementById('rejectReason').value = '';
  openModal('rejectModal');
}

function openTierModal(userId, email, currentTier) {
  document.getElementById('tierUserId').value = userId;
  document.getElementById('tierUserEmail').value = email;
  document.getElementById('targetTierSelect').value = currentTier;
  document.getElementById('tierReasonInput').value = '';
  openModal('tierModal');
}

function initForms() {
  // Method Form (Add QR payment method)
  const methodForm = document.getElementById('methodForm');
  methodForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('methodTitleInput').value.trim();
    const accountName = document.getElementById('methodAccountNameInput').value.trim();
    const accountNumber = document.getElementById('methodAccountNumberInput').value.trim();
    const qrCodeUrl = uploadedAdminQrBase64 || document.getElementById('methodQrUrlInput').value.trim() || undefined;
    const instructions = document.getElementById('methodInstructionsInput').value.trim();
    const active = document.getElementById('methodActiveCheckbox').checked;

    try {
      const res = await fetch(`${API_URL}/api/admin/payment-methods`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          title,
          accountName: accountName || undefined,
          accountNumber,
          qrCodeUrl,
          instructions: instructions || undefined,
          active,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to save payment method');

      closeModal('methodModal');
      showToast('✅ Payment method & QR uploaded successfully!');
      loadAdminPaymentMethods();
    } catch (err) {
      alert('Error saving payment method: ' + err.message);
    }
  });

  // Approve Payment Form
  document.getElementById('approveForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const paymentId = document.getElementById('approvePaymentId').value;
    const durationDays = document.getElementById('approveDuration').value;
    const tier = document.getElementById('approveTier').value;
    const notes = document.getElementById('approveNotes').value;

    try {
      const res = await fetch(`${API_URL}/api/admin/manual-payments/${paymentId}/approve`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ durationDays, tier, notes }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to approve payment');

      closeModal('approveModal');
      showToast('✅ Payment approved! Subscription active and Discord roles synced.');
      loadDashboard();
    } catch (err) {
      alert('Error approving payment: ' + err.message);
    }
  });

  // Reject Payment Form
  document.getElementById('rejectForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const paymentId = document.getElementById('rejectPaymentId').value;
    const reason = document.getElementById('rejectReason').value;

    try {
      const res = await fetch(`${API_URL}/api/admin/manual-payments/${paymentId}/reject`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ reason }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to reject payment');

      closeModal('rejectModal');
      showToast('❌ Payment rejected and audit log recorded.');
      loadDashboard();
    } catch (err) {
      alert('Error rejecting payment: ' + err.message);
    }
  });

  // Direct Payment Form
  document.getElementById('directPaymentForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const studentName = document.getElementById('directName').value;
    const phoneNumber = document.getElementById('directPhone').value;
    const email = document.getElementById('directEmail').value;
    const discordId = document.getElementById('directDiscord').value;
    const transactionId = document.getElementById('directTx').value;
    const amount = document.getElementById('directAmount').value;
    const durationDays = document.getElementById('directDuration').value;
    const tier = document.getElementById('directTier').value;
    const paymentMethod = document.getElementById('directMethod').value;

    try {
      const res = await fetch(`${API_URL}/api/admin/manual-payments/create-direct`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          studentName,
          phoneNumber,
          email,
          discordId,
          transactionId,
          amount,
          durationDays,
          tier,
          paymentMethod,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to record direct payment');

      closeModal('directPaymentModal');
      showToast('✅ Direct payment recorded and subscription active.');
      loadDashboard();
    } catch (err) {
      alert('Error recording payment: ' + err.message);
    }
  });

  // Tier Override Form
  document.getElementById('tierForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const userId = document.getElementById('tierUserId').value;
    const tier = document.getElementById('targetTierSelect').value;
    const reason = document.getElementById('tierReasonInput').value;

    try {
      const res = await fetch(`${API_URL}/api/admin/users/${userId}/tier`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ tier, reason }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to update tier');

      closeModal('tierModal');
      showToast('✅ Student tier updated and role sync triggered.');
      loadStudents();
    } catch (err) {
      alert('Error updating tier: ' + err.message);
    }
  });
}

// Students tab loader
async function loadStudents() {
  const tbody = document.getElementById('studentsTableBody');
  tbody.innerHTML = '<tr><td colspan="7" class="empty-state">Loading students...</td></tr>';

  try {
    const searchVal = document.getElementById('studentSearchInput').value.trim();
    let url = `${API_URL}/api/admin/users`;
    if (searchVal) url += `?search=${encodeURIComponent(searchVal)}`;

    const res = await fetch(url, { headers: authHeaders() });
    const json = await res.json();

    if (!res.ok) throw new Error(json.error);

    if (json.data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No students found.</td></tr>';
      return;
    }

    tbody.innerHTML = json.data
      .map((u) => {
        const dateStr = new Date(u.createdAt).toLocaleDateString();
        const discordTag = u.discordId ? `<code>${u.discordId}</code>` : '<span style="color: #64748b;">Not Linked</span>';

        return `
          <tr>
            <td>${dateStr}</td>
            <td><strong>${escapeHtml(u.email)}</strong></td>
            <td>${discordTag}</td>
            <td><strong style="color: #f1c40f;">Tier ${u.currentTier}</strong></td>
            <td><span class="status-tag ${u.subscriptionStatus}">${u.subscriptionStatus}</span></td>
            <td>🔥 ${u.streakCount}d</td>
            <td>
              <button class="btn-table btn-view" onclick="openTierModal('${u.id}', '${escapeHtml(u.email)}', ${u.currentTier})">
                ⚙️ Set Tier
              </button>
            </td>
          </tr>
        `;
      })
      .join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state">Error: ${err.message}</td></tr>`;
  }
}

// Audit logs tab loader
async function loadAuditLogs() {
  const tbody = document.getElementById('auditTableBody');
  tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Loading audit logs...</td></tr>';

  try {
    const res = await fetch(`${API_URL}/api/admin/audit-logs`, { headers: authHeaders() });
    const json = await res.json();

    if (!res.ok) throw new Error(json.error);

    if (json.data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No audit logs recorded yet.</td></tr>';
      return;
    }

    tbody.innerHTML = json.data
      .map((l) => {
        const timeStr = new Date(l.createdAt).toLocaleDateString() + ' ' + new Date(l.createdAt).toLocaleTimeString();
        return `
          <tr>
            <td><span style="font-size: 0.78rem; color: #94a3b8;">${timeStr}</span></td>
            <td><code>${escapeHtml(l.actorType)}:${escapeHtml(l.actorId)}</code></td>
            <td><strong>${escapeHtml(l.action)}</strong></td>
            <td>${escapeHtml(l.targetType)} (${escapeHtml(l.targetId.slice(0, 8))}...)</td>
            <td>${escapeHtml(l.reason || '-')}</td>
            <td><code style="font-size: 0.72rem;">${escapeHtml(JSON.stringify(l.after || {}).slice(0, 40))}...</code></td>
          </tr>
        `;
      })
      .join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state">Error: ${err.message}</td></tr>`;
  }
}

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.remove('hidden');
  setTimeout(() => {
    toast.classList.add('hidden');
  }, 4000);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
