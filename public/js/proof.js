document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('paymentProofForm');
  const submitBtn = document.getElementById('submitBtn');
  const statusAlert = document.getElementById('statusAlert');
  const successCard = document.getElementById('successCard');
  const confirmedTxId = document.getElementById('confirmedTxId');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Clear alert
    statusAlert.classList.add('hidden');
    statusAlert.className = 'alert hidden';
    statusAlert.textContent = '';

    // Collect data
    const formData = new FormData(form);
    const payload = {
      studentName: formData.get('studentName'),
      phoneNumber: formData.get('phoneNumber'),
      email: formData.get('email'),
      discordId: formData.get('discordId') || undefined,
      paymentMethod: formData.get('paymentMethod'),
      transactionId: formData.get('transactionId'),
      amount: parseFloat(formData.get('amount')),
      proofUrl: formData.get('proofUrl') || undefined,
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

    } catch (error) {
      statusAlert.classList.remove('hidden');
      statusAlert.classList.add('error');
      statusAlert.textContent = error.message || 'An unexpected error occurred. Please verify your details.';
    } finally {
      submitBtn.disabled = false;
      submitBtn.querySelector('.btn-text').textContent = 'Submit Payment Proof';
    }
  });
});
