// Print layout helpers for daily logs
function printDayLog(dayIdx) {
  const day = dayLogs[dayIdx];
  if (!day) return;

  const container = document.getElementById('printLogTableContainer');
  container.innerHTML = '';

  if (day.entries.length === 0) {
    container.innerHTML = '<p style="color:#666;font-size:13px;">No entries for this day.</p>';
  } else {
    const wrapper = document.createElement('div');
    wrapper.className = 'daylog-table-wrap';

    const table = document.createElement('table');
    table.className = 'daylog-table';
    table.style.width = '100%';
    table.style.borderCollapse = 'collapse';

    table.innerHTML = `<thead><tr>
      <th>No.</th>
      <th>Account</th>
      <th>Task</th>
      <th>Time Start</th>
      <th>Time End</th>
      <th>Time Consumed</th>
    </tr></thead>`;

    const tbody = document.createElement('tbody');
    const minRows = Math.max(8, day.entries.length);

    for (let i = 0; i < minRows; i++) {
      const entry = day.entries[i];
      const tr = document.createElement('tr');

      if (entry) {
        const dur = entry.timeIn && entry.timeOut ? calcDuration(entry.timeIn, entry.timeOut) : '—';
        tr.innerHTML = `
          <td>${i + 1}</td>
          <td class="acct">${escHtml(entry.account || '—')}</td>
          <td><ul style="margin:0;padding-left:18px;"><li>${escHtml(entry.title)}</li></ul></td>
          <td>${fmtTime(entry.timeIn)}</td>
          <td>${fmtTime(entry.timeOut)}</td>
          <td class="dur-cell">${dur}</td>`;
      } else {
        tr.innerHTML = `
          <td>${i + 1}</td>
          <td></td>
          <td><ul style="margin:0;padding-left:18px;"><li>&nbsp;</li></ul></td>
          <td></td>
          <td></td>
          <td></td>`;
      }

      tbody.appendChild(tr);
    }

    const totalTime = totalMs(day.entries);
    const totalTr = document.createElement('tr');
    totalTr.className = 'daylog-total-row';
    totalTr.innerHTML = `<td colspan="6">Total: ${fmtTotalMs(totalTime)}</td>`;
    tbody.appendChild(totalTr);

    table.appendChild(tbody);
    wrapper.appendChild(table);
    container.appendChild(wrapper);
  }

  const template = typeof getSelectedTemplateSpec === 'function' ? getSelectedTemplateSpec() : null;
  document.getElementById('printLogDayLabel').textContent = day.label + ' · ' + day.date;
  document.getElementById('printLogTemplateLabel').textContent = template ? template.name : '';
  document.getElementById('printLogDate').textContent =
    'Printed: ' + new Date().toLocaleDateString('en-PH', { weekday:'long', year:'numeric', month:'long', day:'numeric' })
    + ' at ' + new Date().toLocaleTimeString('en-PH', { hour:'2-digit', minute:'2-digit', hour12:true });

  const printArea = document.getElementById('printLogArea');
  const mainLayout = document.querySelector('.layout');
  const mobileHeader = document.querySelector('.mobile-header');
  const mobileFooter = document.querySelector('.mobile-fab-area');
  // ensure the body overlay is disabled so the print area is not darkened
  document.body.classList.add('print-active');
  printArea.style.display = 'block';
  if (mainLayout) mainLayout.style.display = 'none';
  if (mobileHeader) mobileHeader.style.display = 'none';
  if (mobileFooter) mobileFooter.style.display = 'none';
}
// function buildDayLogWordHtml(day, templateSpec) {
//   const rows = [];
//   const minRows = Math.max(8, day.entries.length);

//   for (let i = 0; i < minRows; i++) {
//     const entry = day.entries[i];
//     if (entry) {
//       const duration = entry.timeIn && entry.timeOut ? calcDuration(entry.timeIn, entry.timeOut) : '—';
//       rows.push(`<tr>
//         <td style="text-align:center;">${i + 1}</td>
//         <td style="text-align:center;font-weight:700;color:#1f7a56;">${escHtml(entry.account || '—')}</td>
//         <td style="padding-left:10px;">${escHtml(entry.title)}</td>
//         <td style="text-align:center;font-family:monospace;">${fmtTime(entry.timeIn)}</td>
//         <td style="text-align:center;font-family:monospace;">${fmtTime(entry.timeOut)}</td>
//         <td style="text-align:center;font-family:monospace;">${duration}</td>
//       </tr>`);
//     } else {
//       rows.push(`<tr>
//         <td style="text-align:center;">${i + 1}</td>
//         <td>&nbsp;</td>
//         <td>&nbsp;</td>
//         <td>&nbsp;</td>
//         <td>&nbsp;</td>
//         <td>&nbsp;</td>
//       </tr>`);
//     }
//   }

//   const tableHtml = `
// <table style="width:100%; max-width:900px; margin:18px auto 0; border-collapse:collapse;">
//   <thead><tr>
//     <th style="border:1px solid #c8d6ce; padding:10px 12px; background:#e8f6e9; color:#2b5b3b; text-transform:uppercase; font-size:10px; letter-spacing:0.6px;">No.</th>
//     <th style="border:1px solid #c8d6ce; padding:10px 12px; background:#e8f6e9; color:#2b5b3b; text-transform:uppercase; font-size:10px; letter-spacing:0.6px;">Account</th>
//     <th style="border:1px solid #c8d6ce; padding:10px 12px; background:#e8f6e9; color:#2b5b3b; text-transform:uppercase; font-size:10px; letter-spacing:0.6px;">Task</th>
//     <th style="border:1px solid #c8d6ce; padding:10px 12px; background:#e8f6e9; color:#2b5b3b; text-transform:uppercase; font-size:10px; letter-spacing:0.6px;">Time Start</th>
//     <th style="border:1px solid #c8d6ce; padding:10px 12px; background:#e8f6e9; color:#2b5b3b; text-transform:uppercase; font-size:10px; letter-spacing:0.6px;">Time End</th>
//     <th style="border:1px solid #c8d6ce; padding:10px 12px; background:#e8f6e9; color:#2b5b3b; text-transform:uppercase; font-size:10px; letter-spacing:0.6px;">Time Consumed</th>
//   </tr></thead>
//   <tbody>${rows.join('')}</tbody>
//   <tfoot><tr><td colspan="6" style="border:1px solid #c8d6ce; padding:10px 12px; background:#e8f6e9; font-weight:700; text-align:right;">Total: ${fmtTotalMs(totalMs(day.entries))}</td></tr></tfoot>
// </table>`;

//   const templateHtml = templateSpec?.content || '<h1>{{TITLE}}</h1>\n<p>{{SUBTITLE}}</p>{{TABLE}}';
//   const bodyHtml = typeof mergeTemplateHtml === 'function' ? mergeTemplateHtml(templateHtml, tableHtml) : templateHtml.replace(/{{TABLE}}/g, tableHtml);

//   return `<!DOCTYPE html>
// <html>
// <head>
// <meta charset="utf-8">
// <title>${escHtml(day.label)} — ${escHtml(day.date)}</title>
// <style>
//   body { font-family: Arial, Helvetica, sans-serif; color: #0E0F13; margin: 24px; }
//   h1 { font-size: 18px; margin-bottom: 6px; }
//   p { margin: 0; color: #47535e; font-size: 12px; }
// </style>
// </head>
// <body>
//   <h1>${escHtml(templateSpec?.name || 'Daily Log')}</h1>
//   <p>${escHtml(day.label)} · ${escHtml(day.date)}</p>
//   ${bodyHtml}
// </body>
// </html>`;
// }


function buildDayLogWordHtml(day, templateSpec) {
  const rows = [];
  const minRows = Math.max(8, day.entries.length);

  for (let i = 0; i < minRows; i++) {
    const entry = day.entries[i];
    if (entry) {
      const duration = entry.timeIn && entry.timeOut ? calcDuration(entry.timeIn, entry.timeOut) : '—';
      rows.push(`<tr>
        <td style="border:1px solid #c8d6ce; padding:8px 10px; text-align:center;">${i + 1}</td>
        <td style="border:1px solid #c8d6ce; padding:8px 10px; text-align:center; font-weight:700; color:#1f7a56;">${escHtml(entry.account || '—')}</td>
        <td style="border:1px solid #c8d6ce; padding:8px 10px; text-align:left;">${escHtml(entry.title)}</td>
        <td style="border:1px solid #c8d6ce; padding:8px 10px; text-align:center; font-family:monospace;">${fmtTime(entry.timeIn)}</td>
        <td style="border:1px solid #c8d6ce; padding:8px 10px; text-align:center; font-family:monospace;">${fmtTime(entry.timeOut)}</td>
        <td style="border:1px solid #c8d6ce; padding:8px 10px; text-align:center; font-family:monospace;">${duration}</td>
      </tr>`);
    } else {
      rows.push(`<tr>
        <td style="border:1px solid #c8d6ce; padding:8px 10px; text-align:center;">${i + 1}</td>
        <td style="border:1px solid #c8d6ce; padding:8px 10px;">&nbsp;</td>
        <td style="border:1px solid #c8d6ce; padding:8px 10px;">&nbsp;</td>
        <td style="border:1px solid #c8d6ce; padding:8px 10px;">&nbsp;</td>
        <td style="border:1px solid #c8d6ce; padding:8px 10px;">&nbsp;</td>
        <td style="border:1px solid #c8d6ce; padding:8px 10px;">&nbsp;</td>
      </tr>`);
    }
  }

  // Pure isolated table layout with fixed widths to prevent overlapping text in Word
  const tableHtml = `
<table border="1" cellspacing="0" cellpadding="0" style="width:100%; max-width:700px; border-collapse:collapse; font-family:Arial, sans-serif; font-size:11px; color:#0E0F13;">
  <thead>
    <tr style="background:#e8f6e9;">
      <th width="5%" style="border:1px solid #c8d6ce; padding:10px; color:#2b5b3b; text-transform:uppercase; font-size:10px; font-weight:bold;">No.</th>
      <th width="15%" style="border:1px solid #c8d6ce; padding:10px; color:#2b5b3b; text-transform:uppercase; font-size:10px; font-weight:bold;">Account</th>
      <th width="45%" style="border:1px solid #c8d6ce; padding:10px; color:#2b5b3b; text-transform:uppercase; font-size:10px; font-weight:bold;">Task</th>
      <th width="11%" style="border:1px solid #c8d6ce; padding:10px; color:#2b5b3b; text-transform:uppercase; font-size:10px; font-weight:bold;">Start</th>
      <th width="11%" style="border:1px solid #c8d6ce; padding:10px; color:#2b5b3b; text-transform:uppercase; font-size:10px; font-weight:bold;">End</th>
      <th width="13%" style="border:1px solid #c8d6ce; padding:10px; color:#2b5b3b; text-transform:uppercase; font-size:10px; font-weight:bold;">Consumed</th>
    </tr>
  </thead>
  <tbody>
    ${rows.join('')}
  </tbody>
  <tfoot>
    <tr>
      <td colspan="6" style="border:1px solid #c8d6ce; padding:10px; background:#e8f6e9; font-weight:bold; text-align:right; color:#2b5b3b;">
        Total: ${fmtTotalMs(totalMs(day.entries))}
      </td>
    </tr>
  </footer>
</table>`;

  // Returns ONLY the clean table wrapped inside the document body
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${escHtml(day.label)} — ${escHtml(day.date)}</title>
<style>
  body { margin: 0px; padding: 0px; }
</style>
</head>
<body>
  ${tableHtml}
</body>
</html>`;
}

function downloadDayLogWord(dayIdx) {
  const day = dayLogs[dayIdx];
  if (!day) return;

  const template = typeof getSelectedTemplateSpec === 'function' ? getSelectedTemplateSpec() : null;
  const html = buildDayLogWordHtml(day, template);

  const blob = new Blob([html], { type: 'application/msword' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `DailyLog_${(template?.name || 'template').replace(/\s+/g, '_')}_${day.label.replace(/\s+/g, '_')}_${day.date.replace(/[^0-9a-zA-Z]+/g, '_')}.doc`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

async function downloadDayLogPdf(dayIdx) {
  const day = dayLogs[dayIdx];
  if (!day || typeof html2canvas === 'undefined' || !window.jspdf) {
    alert('PDF download is unavailable.');
    return;
  }

  printDayLog(dayIdx);
  const printArea = document.getElementById('printLogArea');
  if (!printArea) return;

  const canvas = await html2canvas(printArea, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff'
  });

  const imgData = canvas.toDataURL('image/jpeg', 0.95);
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = pdf.internal.pageSize.getHeight();
  const imgProps = pdf.getImageProperties(imgData);
  const ratio = Math.min(pdfWidth / imgProps.width, pdfHeight / imgProps.height);
  const imgWidth = imgProps.width * ratio;
  const imgHeight = imgProps.height * ratio;
  pdf.addImage(imgData, 'JPEG', (pdfWidth - imgWidth) / 2, 0, imgWidth, imgHeight);
  pdf.save(`DailyLog_${day.label.replace(/\s+/g, '_')}.pdf`);

  closePrintLog();
}
function closePrintLog() {
  const printArea = document.getElementById('printLogArea');
  const mainLayout = document.querySelector('.layout');
  const mobileHeader = document.querySelector('.mobile-header');
  const mobileFooter = document.querySelector('.mobile-fab-area');

  if (printArea) printArea.style.display = 'none';
  // re-enable overlay when closing print view
  document.body.classList.remove('print-active');
  if (mainLayout) mainLayout.style.display = 'flex';
  if (mobileHeader) mobileHeader.style.display = 'block';
  if (mobileFooter) mobileFooter.style.display = 'block';
}

// Auto-show print view for Day 1 (index 0) when requested.
// Attempts a few times in case `dayLogs` is populated asynchronously.
(function autoShowDay1(){
  const tryShow = (attemptsLeft) => {
    if (typeof printDayLog !== 'function') return;
    if (typeof dayLogs !== 'undefined' && Array.isArray(dayLogs) && dayLogs.length > 0) {
      // show first day (index 0)
      printDayLog(0);
      return;
    }
    if (attemptsLeft > 0) {
      setTimeout(() => tryShow(attemptsLeft - 1), 200);
    }
  };

  // Only trigger if URL contains `printDay=1` or hash `#printDay1`
  const params = new URLSearchParams(window.location.search);
  const shouldAuto = params.get('printDay') === '1' || window.location.hash === '#printDay1';
  if (shouldAuto) tryShow(10);
})();
