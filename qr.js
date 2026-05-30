window.QRCodeUtil = (function() {
  function render(text, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    if (typeof qrcode === 'undefined') {
      container.textContent = 'QR library not loaded';
      return;
    }
    container.innerHTML = '';

    const typeNumber = 0;
    const errorCorrectionLevel = 'L';
    const qr = qrcode(typeNumber, errorCorrectionLevel);
    qr.addData(text);
    qr.make();

    const img = document.createElement('img');
    img.src = qr.createDataURL(4, 0);
    img.alt = 'Sync QR code';
    img.style.width = '200px';
    img.style.height = '200px';
    img.style.borderRadius = '12px';
    img.style.display = 'inline-block';
    container.appendChild(img);
  }

  return { render };
})();
