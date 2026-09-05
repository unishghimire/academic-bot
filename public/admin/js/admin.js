let currentAdminKey = sessionStorage.getItem('academy_admin_key') || '';
let currentFilter = 'PENDING';
let paymentsData = [];

// Init on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  initAuth();
  initNavigation();
  initModals();
  initSearch();
  initForms();
});

function initAuth() {
  const authModal = document.getElementById('authModal');
  const authForm = document.getElementById('authForm');
  const adminKeyInput = document.getElementById('adminKeyInput');
  const authError = document.getElementById('authError');
  const logoutBtn = document.getElementById('logoutBtn');

  if (!currentAdminKey) {
    authModal.classList.remove('hidden');
  } else {
    loadDashboard();
  }

  authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const key = adminKeyInput.value.trim();
    if (!key) return;

    try {
      const res = await fetch('/api/admin/stats', {
        headers: { 'x-admin-key': key },
      });

      if (!res.ok) {
        throw new Error('Unauthorized');
      }

      currentAdminKey = key;
      sessionStorage.setItem('academy_admin_key', key);
      authModal.classList.add('hidden');
      loadDashboard();
    } catch {
      authError.classList.remove('hidden');
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
}

async function loadStats() {
  try {
    const res = await fetch('/api/admin/stats', { headers: authHeaders() });
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
    let url = `/api/admin/manual-payments?status=${currentFilter}`;
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
        ? `<a href="${p.proofUrl}" target="_blank" class="btn-table btn-view">👁️ View Receipt</a>`
        : '<span style="color: #64748b;">No Link</span>';

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
  studentSearch?.addEventListener('input', () => {
    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => {
      loadStudents();
    }, 300);
  });
}

function initModals() {
  document.getElementById('openDirectPaymentBtn').addEventListener('click', () => {
    openModal('directPaymentModal');
  });
}

function openModal(id) {
  document.getElementById(id).classList.remove('hidden');
}

function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
}

function openApproveModal(paymentId) {
  const p = paymentsData.find((x) => x.id === paymentId);
  if (!p) return;

  document.getElementById('approvePaymentId').value = p.id;
  document.getElementById('approveStudentName').textContent = p.studentName;
  document.getElementById('approvePhoneNumber').textContent = p.phoneNumber;
  document.getElementById('approveTxId').textContent = p.transactionId;
  document.getElementById('approveAmount').textContent = `$${p.amount.toFixed(2)}`;
  document.getElementById('approveNotes').value = `Verified payment proof for ${p.studentName}`;

  openModal('approveModal');
}

function openRejectModal(paymentId) {
  document.getElementById('rejectPaymentId').value = paymentId;
  document.getElementById('rejectReason').value = '';
  openModal('rejectModal');
}

function openTierModal(userId, userEmail, currentTier) {
  document.getElementById('tierUserId').value = userId;
  document.getElementById('tierUserEmail').value = userEmail;
  document.getElementById('targetTierSelect').value = String(currentTier);
  document.getElementById('tierReasonInput').value = '';
  openModal('tierModal');
}

function initForms() {
  // Approve Form
  document.getElementById('approveForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('approvePaymentId').value;
    const durationDays = document.getElementById('approveDuration').value;
    const tier = document.getElementById('approveTier').value;
    const notes = document.getElementById('approveNotes').value;

    try {
      const res = await fetch(`/api/admin/manual-payments/${id}/approve`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ durationDays, tier, notes }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to approve');

      closeModal('approveModal');
      showToast('✅ Payment approved! Subscription active and Discord roles synced.');
      loadDashboard();
    } catch (err) {
      alert('Error approving payment: ' + err.message);
    }
  });

  // Reject Form
  document.getElementById('rejectForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('rejectPaymentId').value;
    const reason = document.getElementById('rejectReason').value;

    try {
      const res = await fetch(`/api/admin/manual-payments/${id}/reject`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ reason }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to reject');

      closeModal('rejectModal');
      showToast('❌ Payment proof rejected.');
      loadDashboard();
    } catch (err) {
      alert('Error rejecting payment: ' + err.message);
    }
  });

  // Direct Payment Form
  document.getElementById('directPaymentForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      studentName: document.getElementById('directName').value,
      phoneNumber: document.getElementById('directPhone').value,
      email: document.getElementById('directEmail').value,
      discordId: document.getElementById('directDiscord').value || undefined,
      transactionId: document.getElementById('directTx').value || undefined,
      amount: document.getElementById('directAmount').value,
      durationDays: document.getElementById('directDuration').value,
      tier: document.getElementById('directTier').value,
      paymentMethod: document.getElementById('directMethod').value,
    };

    try {
      const res = await fetch('/api/admin/manual-payments/create-direct', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to record direct payment');

      closeModal('directPaymentModal');
      document.getElementById('directPaymentForm').reset();
      showToast('✅ Direct payment recorded and subscription activated!');
      loadDashboard();
    } catch (err) {
      alert('Error creating payment: ' + err.message);
    }
  });

  // Tier Override Form
  document.getElementById('tierForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const userId = document.getElementById('tierUserId').value;
    const tier = document.getElementById('targetTierSelect').value;
    const reason = document.getElementById('tierReasonInput').value;

    try {
      const res = await fetch(`/api/admin/users/${userId}/tier`, {
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
    let url = '/api/admin/users';
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
    const res = await fetch('/api/admin/audit-logs', { headers: authHeaders() });
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
