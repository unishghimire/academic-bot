document.addEventListener('DOMContentLoaded', () => {
  const API_URL = window.API_BASE || window.location.origin;

  // State
  let selectedTier = 2;
  let selectedPrice = 49.0;
  let selectedTierName = 'Tier 2 — Practitioner';
  let selectedMethodTitle = '';
  let uploadedReceiptBase64 = null;
  let methodsData = [];

  // DOM Elements
  const form = document.getElementById('paymentProofForm');
  const submitBtn = document.getElementById('submitBtn');
  const statusAlert = document.getElementById('statusAlert');
  const successCard = document.getElementById('successCard');
  const confirmedTxId = document.getElementById('confirmedTxId');
  const copyRefBtn = document.getElementById('copyRefBtn');
  const paymentMethodSelect = document.getElementById('paymentMethod');
  const amountInput = document.getElementById('amount');
  const methodsContainer = document.getElementById('methodsContainer');
  const methodsLoading = document.getElementById('methodsLoading');
  const noMethodsAlert = document.getElementById('noMethodsAlert');

  // Summary elements
  const summaryTierName = document.getElementById('summaryTierName');
  const summaryMethodName = document.getElementById('summaryMethodName');
  const summaryAmount = document.getElementById('summaryAmount');

  // Stepper elements
  const step1 = document.getElementById('stepIndicator1');
  const step2 = document.getElementById('stepIndicator2');
  const step3 = document.getElementById('stepIndicator3');

  // File Upload Elements
  const dropZone = document.getElementById('dropZone');
  const receiptFileInput = document.getElementById('receiptFileInput');
  const dropZoneContent = document.getElementById('dropZoneContent');
  const receiptPreviewContainer = document.getElementById('receiptPreviewContainer');
  const receiptPreviewImg = document.getElementById('receiptPreviewImg');
  const previewFileName = document.getElementById('previewFileName');
  const previewFileSize = document.getElementById('previewFileSize');
  const removeReceiptBtn = document.getElementById('removeReceiptBtn');
  const proofUrlInput = document.getElementById('proofUrl');

  // Modals
  const qrZoomModal = document.getElementById('qrZoomModal');
  const zoomTitle = document.getElementById('zoomTitle');
  const zoomImage = document.getElementById('zoomImage');
  const downloadQrBtn = document.getElementById('downloadQrBtn');
  const closeZoomBtn = document.getElementById('closeZoomBtn');

  const discordGuideModal = document.getElementById('discordGuideModal');
  const discordHelpBtn = document.getElementById('discordHelpBtn');
  const closeGuideBtn = document.getElementById('closeGuideBtn');
  const guideUnderstoodBtn = document.getElementById('guideUnderstoodBtn');

  const toast = document.getElementById('toast');

  // Initialize
  initTierSelection();
  loadPaymentMethods();
  initFileUpload();
  initModals();
  initClipboardPaste();
  initFormSubmit();

  /* ==========================================================================
     1. TIER SELECTION LOGIC
     ========================================================================== */
  function initTierSelection() {
    const tierCards = document.querySelectorAll('.tier-card');
    const customToggle = document.getElementById('customAmountToggle');
    const customInputWrapper = document.getElementById('customAmountInputWrapper');
    const customAmountField = document.getElementById('customAmountField');

    tierCards.forEach((card) => {
      card.addEventListener('click', () => {
        tierCards.forEach((c) => c.classList.remove('selected'));
        card.classList.add('selected');

        selectedTier = parseInt(card.dataset.tier, 10);
        selectedPrice = parseFloat(card.dataset.price);
        selectedTierName = card.dataset.tierName;

        // Uncheck custom if checked
        if (customToggle) {
          customToggle.checked = false;
          customInputWrapper?.classList.add('hidden');
        }

        updateSummary();
        setStepActive(2);
      });
    });

    // Custom Amount Toggle
    customToggle?.addEventListener('change', (e) => {
      if (e.target.checked) {
        tierCards.forEach((c) => c.classList.remove('selected'));
        customInputWrapper?.classList.remove('hidden');
        customAmountField?.focus();
        selectedTierName = 'Custom Plan / Invoice';
        if (customAmountField && customAmountField.value) {
          selectedPrice = parseFloat(customAmountField.value) || 0;
        }
      } else {
        customInputWrapper?.classList.add('hidden');
        // Re-select Tier 2 default
        const t2 = document.querySelector('.tier-card[data-tier="2"]');
        if (t2) t2.click();
      }
      updateSummary();
    });

    customAmountField?.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      selectedPrice = isNaN(val) ? 0 : val;
      updateSummary();
    });
  }

  function updateSummary() {
    if (summaryTierName) summaryTierName.textContent = selectedTierName;
    if (summaryAmount) summaryAmount.textContent = `$${selectedPrice.toFixed(2)}`;
    if (amountInput) amountInput.value = selectedPrice > 0 ? selectedPrice.toFixed(2) : '';
  }

  /* ==========================================================================
     2. PAYMENT METHODS & QR CODES
     ========================================================================== */
  async function loadPaymentMethods() {
    try {
      const res = await fetch(`${API_URL}/api/payments/methods`);
      const json = await res.json();

      methodsLoading?.classList.add('hidden');

      if (!res.ok || !json.success || !json.data || json.data.length === 0) {
        noMethodsAlert?.classList.remove('hidden');
        return;
      }

      methodsData = json.data;
      renderMethods(methodsData);
      populateSelectOptions(methodsData);
    } catch (err) {
      console.error('Error fetching payment methods:', err);
      methodsLoading?.classList.add('hidden');
      noMethodsAlert?.classList.remove('hidden');
    }
  }

  function renderMethods(methods) {
    if (!methodsContainer) return;
    methodsContainer.innerHTML = '';
    methodsContainer.classList.remove('hidden');

    methods.forEach((m, idx) => {
      const card = document.createElement('div');
      card.className = `method-card ${idx === 0 ? 'selected' : ''}`;
      card.dataset.methodTitle = m.title;

      const qrHtml = m.qrCodeUrl
        ? `<div class="method-qr-container" title="Click to zoom in on QR Code">
             <img src="${m.qrCodeUrl}" alt="${m.title} QR" class="method-qr-img">
           </div>`
        : `<div class="method-no-qr">
             <span>💳</span>
             <span>Account Details Only</span>
           </div>`;

      const accountNameHtml = m.accountName
        ? `<div class="detail-item">
             <div class="detail-label">Account Holder</div>
             <div class="account-copy-row">
               <span class="account-val" id="nameVal_${m.id}">${escapeHtml(m.accountName)}</span>
               <button type="button" class="btn-copy" data-copy="${escapeHtml(m.accountName)}">Copy</button>
             </div>
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
            <div class="detail-label">Account Number / Phone / Wallet</div>
            <div class="account-copy-row">
              <span class="account-val" id="accVal_${m.id}">${escapeHtml(m.accountNumber)}</span>
              <button type="button" class="btn-copy" data-copy="${escapeHtml(m.accountNumber)}">Copy</button>
            </div>
          </div>
        </div>
        ${instructionsHtml}
        <button type="button" class="btn-select-method">Pay with ${escapeHtml(m.title)}</button>
      `;

      // Zoom QR handler
      const qrEl = card.querySelector('.method-qr-container');
      qrEl?.addEventListener('click', (e) => {
        e.stopPropagation();
        openQrZoom(m.qrCodeUrl, m.title);
      });

      // Select method card handler
      card.addEventListener('click', (e) => {
        if (e.target.classList.contains('btn-copy')) return;
        selectMethodCard(card, m.title);
      });

      methodsContainer.appendChild(card);
    });

    // Auto-select first method
    if (methods.length > 0) {
      selectMethodCard(methodsContainer.firstElementChild, methods[0].title, false);
    }

    initCopyButtons();
  }

  function selectMethodCard(card, methodTitle, scrollIntoView = true) {
    document.querySelectorAll('.method-card').forEach((c) => c.classList.remove('selected'));
    card.classList.add('selected');

    selectedMethodTitle = methodTitle;
    if (summaryMethodName) summaryMethodName.textContent = methodTitle;

    syncDropdown(methodTitle);
    setStepActive(3);

    if (scrollIntoView) {
      const formSection = document.getElementById('formSection');
      formSection?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function syncDropdown(methodTitle) {
    if (!paymentMethodSelect) return;
    for (let i = 0; i < paymentMethodSelect.options.length; i++) {
      if (paymentMethodSelect.options[i].value.toLowerCase() === methodTitle.toLowerCase()) {
        paymentMethodSelect.selectedIndex = i;
        return;
      }
    }
    const opt = document.createElement('option');
    opt.value = methodTitle;
    opt.textContent = methodTitle;
    paymentMethodSelect.appendChild(opt);
    paymentMethodSelect.value = methodTitle;
  }

  function populateSelectOptions(methods) {
    if (!paymentMethodSelect) return;
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

    paymentMethodSelect.addEventListener('change', (e) => {
      const val = e.target.value;
      selectedMethodTitle = val;
      if (summaryMethodName) summaryMethodName.textContent = val;
      // Sync matching card if present
      document.querySelectorAll('.method-card').forEach((c) => {
        if (c.dataset.methodTitle?.toLowerCase() === val.toLowerCase()) {
          c.classList.add('selected');
        } else {
          c.classList.remove('selected');
        }
      });
    });
  }

  /* ==========================================================================
     3. FILE UPLOAD & CLIPBOARD PASTE
     ========================================================================== */
  function initFileUpload() {
    if (!dropZone || !receiptFileInput) return;

    dropZone.addEventListener('click', () => receiptFileInput.click());

    ['dragenter', 'dragover'].forEach((evt) => {
      dropZone.addEventListener(evt, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.add('dragover');
      });
    });

    ['dragleave', 'drop'].forEach((evt) => {
      dropZone.addEventListener(evt, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.remove('dragover');
      });
    });

    dropZone.addEventListener('drop', (e) => {
      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        processReceiptFile(files[0]);
      }
    });

    receiptFileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        processReceiptFile(e.target.files[0]);
      }
    });

    removeReceiptBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      clearReceiptFile();
    });
  }

  function initClipboardPaste() {
    window.addEventListener('paste', (e) => {
      const items = (e.clipboardData || e.originalEvent?.clipboardData)?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile();
          if (file) {
            processReceiptFile(file, 'pasted_screenshot.png');
            showToast('📋 Screenshot pasted from clipboard!');
            break;
          }
        }
      }
    });
  }

  function processReceiptFile(file, overrideName) {
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file (PNG, JPG, JPEG, WEBP).');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      alert('File size exceeds 10MB. Please choose a smaller image.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      uploadedReceiptBase64 = event.target.result;
      if (receiptPreviewImg) receiptPreviewImg.src = uploadedReceiptBase64;
      if (previewFileName) previewFileName.textContent = overrideName || file.name || 'receipt_screenshot.png';
      if (previewFileSize) previewFileSize.textContent = formatBytes(file.size);

      dropZoneContent?.classList.add('hidden');
      receiptPreviewContainer?.classList.remove('hidden');

      if (proofUrlInput) proofUrlInput.value = '';
    };
    reader.readAsDataURL(file);
  }

  function clearReceiptFile() {
    uploadedReceiptBase64 = null;
    if (receiptFileInput) receiptFileInput.value = '';
    if (receiptPreviewImg) receiptPreviewImg.src = '';
    receiptPreviewContainer?.classList.add('hidden');
    dropZoneContent?.classList.remove('hidden');
  }

  /* ==========================================================================
     4. MODALS & HELPERS
     ========================================================================== */
  function initModals() {
    // QR Zoom
    closeZoomBtn?.addEventListener('click', () => qrZoomModal?.classList.add('hidden'));
    qrZoomModal?.addEventListener('click', (e) => {
      if (e.target === qrZoomModal) qrZoomModal.classList.add('hidden');
    });

    // Discord Guide
    discordHelpBtn?.addEventListener('click', () => discordGuideModal?.classList.remove('hidden'));
    closeGuideBtn?.addEventListener('click', () => discordGuideModal?.classList.add('hidden'));
    guideUnderstoodBtn?.addEventListener('click', () => discordGuideModal?.classList.add('hidden'));
    discordGuideModal?.addEventListener('click', (e) => {
      if (e.target === discordGuideModal) discordGuideModal.classList.add('hidden');
    });

    // Copy Ref on Success
    copyRefBtn?.addEventListener('click', () => {
      const code = confirmedTxId?.textContent;
      if (code) {
        navigator.clipboard.writeText(code).then(() => showToast('✓ Reference code copied!'));
      }
    });
  }

  function openQrZoom(qrUrl, title) {
    if (!qrZoomModal || !zoomImage) return;
    zoomImage.src = qrUrl;
    if (zoomTitle) zoomTitle.textContent = `${title} • Official QR Code`;
    if (downloadQrBtn) downloadQrBtn.href = qrUrl;
    qrZoomModal.classList.remove('hidden');
  }

  function initCopyButtons() {
    document.querySelectorAll('.btn-copy').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const textToCopy = btn.dataset.copy;
        if (textToCopy) {
          navigator.clipboard.writeText(textToCopy).then(() => {
            const originalText = btn.textContent;
            btn.textContent = '✓ Copied!';
            btn.classList.add('copied');
            showToast(`Copied: ${textToCopy}`);
            setTimeout(() => {
              btn.textContent = originalText;
              btn.classList.remove('copied');
            }, 2000);
          });
        }
      });
    });
  }

  function showToast(msg) {
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 3000);
  }

  function setStepActive(stepNum) {
    if (stepNum >= 1) step1?.classList.add('active');
    if (stepNum >= 2) {
      step1?.classList.add('completed');
      step2?.classList.add('active');
    }
    if (stepNum >= 3) {
      step2?.classList.add('completed');
      step3?.classList.add('active');
    }
  }

  /* ==========================================================================
     5. FORM SUBMISSION
     ========================================================================== */
  function initFormSubmit() {
    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      statusAlert?.classList.add('hidden');
      if (statusAlert) statusAlert.textContent = '';

      const formData = new FormData(form);
      const proofUrl = uploadedReceiptBase64 || formData.get('proofUrl')?.toString().trim() || undefined;

      if (!proofUrl) {
        if (statusAlert) {
          statusAlert.classList.remove('hidden');
          statusAlert.className = 'alert error';
          statusAlert.textContent = '⚠️ Please upload a screenshot of your transfer receipt (or paste an image link).';
          dropZone?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        return;
      }

      const amountVal = parseFloat(formData.get('amount')?.toString() || '0');
      if (isNaN(amountVal) || amountVal <= 0) {
        if (statusAlert) {
          statusAlert.classList.remove('hidden');
          statusAlert.className = 'alert error';
          statusAlert.textContent = '⚠️ Please enter a valid payment amount.';
        }
        return;
      }

      const payload = {
        studentName: formData.get('studentName')?.toString().trim(),
        phoneNumber: formData.get('phoneNumber')?.toString().trim(),
        email: formData.get('email')?.toString().trim().toLowerCase(),
        discordId: formData.get('discordId')?.toString().trim() || undefined,
        paymentMethod: formData.get('paymentMethod')?.toString().trim(),
        transactionId: formData.get('transactionId')?.toString().trim(),
        amount: amountVal,
        proofUrl,
        notes: formData.get('notes')?.toString().trim() || undefined,
      };

      // Loading state
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.querySelector('.btn-text').textContent = 'Submitting Proof for Verification...';
        submitBtn.querySelector('.spinner')?.classList.remove('hidden');
      }

      try {
        const response = await fetch(`${API_URL}/api/payments/manual-submit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.error || 'Failed to submit payment proof');
        }

        // Transition to success screen
        form.classList.add('hidden');
        if (confirmedTxId) confirmedTxId.textContent = data.data.transactionId;
        successCard?.classList.remove('hidden');
        successCard?.scrollIntoView({ behavior: 'smooth', block: 'center' });

        showToast('🎉 Payment verification submitted successfully!');
      } catch (error) {
        if (statusAlert) {
          statusAlert.classList.remove('hidden');
          statusAlert.className = 'alert error';
          statusAlert.textContent = error.message || 'An unexpected error occurred. Please verify your details and try again.';
        }
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.querySelector('.btn-text').textContent = 'Submit Payment Proof for Verification';
          submitBtn.querySelector('.spinner')?.classList.add('hidden');
        }
      }
    });
  }

  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
});
