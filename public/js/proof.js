document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('paymentProofForm');
  const submitBtn = document.getElementById('submitBtn');
  const statusAlert = document.getElementById('statusAlert');
  const successCard = document.getElementById('successCard');
  const confirmedTxId = document.getElementById('confirmedTxId');
  const paymentMethodSelect = document.getElementById('paymentMethod');
  const methodsContainer = document.getElementById('methodsContainer');
  const methodsLoading = document.getElementById('methodsLoading');
  const noMethodsAlert = document.getElementById('noMethodsAlert');

  // File Upload Elements
  const dropZone = document.getElementById('dropZone');
  const receiptFileInput = document.getElementById('receiptFileInput');
  const dropZoneContent = document.getElementById('dropZoneContent');
  const receiptPreviewContainer = document.getElementById('receiptPreviewContainer');
  const receiptPreviewImg = document.getElementById('receiptPreviewImg');
  const removeReceiptBtn = document.getElementById('removeReceiptBtn');
  const proofUrlInput = document.getElementById('proofUrl');

  let uploadedReceiptBase64 = null;

  // 1. Fetch & Render Available QR Payment Methods
  loadPaymentMethods();

  async function loadPaymentMethods() {
    try {
      const res = await fetch('/api/payments/methods');
      const json = await res.json();

      methodsLoading.classList.add('hidden');

      if (!res.ok || !json.success || !json.data || json.data.length === 0) {
        noMethodsAlert.classList.remove('hidden');
        return;
      }

      const methods = json.data;
      renderMethods(methods);
      populateSelectOptions(methods);
    } catch (err) {
      console.error('Error fetching payment methods:', err);
      methodsLoading.classList.add('hidden');
      noMethodsAlert.classList.remove('hidden');
    }
  }

  function renderMethods(methods) {
    methodsContainer.innerHTML = '';
    methodsContainer.classList.remove('hidden');

    methods.forEach((m, idx) => {
      const card = document.createElement('div');
      card.className = `method-card ${idx === 0 ? 'selected' : ''}`;
      card.dataset.methodTitle = m.title;

      const qrHtml = m.qrCodeUrl
        ? `<div class="method-qr-container" title="Click to view full QR">
             <img src="${m.qrCodeUrl}" alt="${m.title} QR" class="method-qr-img">
           </div>`
        : `<div class="method-no-qr">
             <span>💳</span>
             <span>Account Details Only</span>
           </div>`;

      const accountNameHtml = m.accountName
        ? `<div class="detail-item">
             <div class="detail-label">Account Holder</div>
             <div style="font-weight:600; color:#fff;">${escapeHtml(m.accountName)}</div>
           </div>`
        : '';

      const instructionsHtml = m.instructions
        ? `<div class="method-instructions">💡 ${escapeHtml(m.instructions)}</div>`
        : '';

      card.innerHTML = `
        <div class="method-title-badge">
          <span>⚡</span>
          <span>${escapeHtml(m.title)}</span>
        </div>
        ${qrHtml}
        <div class="method-details">
          ${accountNameHtml}
          <div class="detail-item">
            <div class="detail-label">Account / ID / Wallet</div>
            <div class="account-copy-row">
              <span class="account-val" id="accVal_${m.id}">${escapeHtml(m.accountNumber)}</span>
              <button type="button" class="btn-copy" data-copy-target="accVal_${m.id}">Copy</button>
            </div>
          </div>
        </div>
        ${instructionsHtml}
        <button type="button" class="btn-select-method">Pay with ${escapeHtml(m.title)}</button>
      `;

      // Click card or button to select
      card.addEventListener('click', (e) => {
        if (e.target.classList.contains('btn-copy')) return;
        selectMethodCard(card, m.title);
      });

      methodsContainer.appendChild(card);
    });

    // Auto-select first in dropdown
    if (methods.length > 0) {
      syncDropdown(methods[0].title);
    }

    // Attach copy button listeners
    initCopyButtons();
  }

  function populateSelectOptions(methods) {
    // Add custom active methods to select dropdown if not already present
    methods.forEach((m) => {
      let exists = false;
      for (let i = 0; i < paymentMethodSelect.options.length; i++) {
        if (paymentMethodSelect.options[i].value.toLowerCase() === m.title.toLowerCase()) {
          exists = true;
          break;
        }
      }
      if (!exists) {
        const opt = document.createElement('option');
        opt.value = m.title;
        opt.textContent = m.title;
        paymentMethodSelect.appendChild(opt);
      }
    });
  }

  function selectMethodCard(card, methodTitle) {
    document.querySelectorAll('.method-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    syncDropdown(methodTitle);

    // Scroll to form smoothly
    const formCard = document.querySelector('.form-card');
    if (formCard) {
      formCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function syncDropdown(methodTitle) {
    for (let i = 0; i < paymentMethodSelect.options.length; i++) {
      if (paymentMethodSelect.options[i].value.toLowerCase() === methodTitle.toLowerCase()) {
        paymentMethodSelect.selectedIndex = i;
        return;
      }
    }
    // If not exact match, set as custom option
    const customOpt = document.createElement('option');
    customOpt.value = methodTitle;
    customOpt.textContent = methodTitle;
    paymentMethodSelect.appendChild(customOpt);
    paymentMethodSelect.value = methodTitle;
  }

  function initCopyButtons() {
    document.querySelectorAll('.btn-copy').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const targetId = btn.dataset.copyTarget;
        const textToCopy = document.getElementById(targetId)?.textContent;
        if (textToCopy) {
          navigator.clipboard.writeText(textToCopy).then(() => {
            const originalText = btn.textContent;
            btn.textContent = 'Copied!';
            btn.classList.add('copied');
            setTimeout(() => {
              btn.textContent = originalText;
              btn.classList.remove('copied');
            }, 2000);
          }).catch(err => {
            console.error('Failed to copy text:', err);
          });
        }
      });
    });
  }

  // 2. Receipt File Drag-and-Drop & Picker
  if (dropZone && receiptFileInput) {
    dropZone.addEventListener('click', () => receiptFileInput.click());

    ['dragenter', 'dragover'].forEach(eventName => {
      dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.add('dragover');
      });
    });

    ['dragleave', 'drop'].forEach(eventName => {
      dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.remove('dragover');
      });
    });

    dropZone.addEventListener('drop', (e) => {
      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        handleReceiptFile(files[0]);
      }
    });

    receiptFileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        handleReceiptFile(e.target.files[0]);
      }
    });

    removeReceiptBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      clearReceiptFile();
    });
  }

  function handleReceiptFile(file) {
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file (PNG, JPG, WEBP).');
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      alert('Image file size must be less than 8MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      uploadedReceiptBase64 = event.target.result;
      receiptPreviewImg.src = uploadedReceiptBase64;
      dropZoneContent.classList.add('hidden');
      receiptPreviewContainer.classList.remove('hidden');
      // Clear URL input since file is uploaded
      if (proofUrlInput) proofUrlInput.value = '';
    };
    reader.readAsDataURL(file);
  }

  function clearReceiptFile() {
    uploadedReceiptBase64 = null;
    receiptFileInput.value = '';
    receiptPreviewImg.src = '';
    receiptPreviewContainer.classList.add('hidden');
    dropZoneContent.classList.remove('hidden');
  }

  // 3. Form Submit Handler
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Clear alert
    statusAlert.classList.add('hidden');
    statusAlert.className = 'alert hidden';
    statusAlert.textContent = '';

    const formData = new FormData(form);
    const proofUrl = uploadedReceiptBase64 || formData.get('proofUrl') || undefined;

    if (!proofUrl) {
      statusAlert.classList.remove('hidden');
      statusAlert.classList.add('error');
      statusAlert.textContent = 'Please provide a receipt screenshot (upload image or provide image link).';
      return;
    }

    const payload = {
      studentName: formData.get('studentName'),
      phoneNumber: formData.get('phoneNumber'),
      email: formData.get('email'),
      discordId: formData.get('discordId') || undefined,
      paymentMethod: formData.get('paymentMethod'),
      transactionId: formData.get('transactionId'),
      amount: parseFloat(formData.get('amount')),
      proofUrl,
      notes: formData.get('notes') || undefined,
    };

    // UI Loading state
    submitBtn.disabled = true;
    submitBtn.querySelector('.btn-text').textContent = 'Submitting Proof...';

    try {
      const response = await fetch('/api/payments/manual-submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to submit payment proof');
      }

      // Show success screen
      form.classList.add('hidden');
      confirmedTxId.textContent = data.data.transactionId;
      successCard.classList.remove('hidden');
      successCard.scrollIntoView({ behavior: 'smooth', block: 'center' });

    } catch (error) {
      statusAlert.classList.remove('hidden');
      statusAlert.classList.add('error');
      statusAlert.textContent = error.message || 'An unexpected error occurred. Please verify your details.';
    } finally {
      submitBtn.disabled = false;
      submitBtn.querySelector('.btn-text').textContent = 'Submit Payment Proof';
    }
  });

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
});
