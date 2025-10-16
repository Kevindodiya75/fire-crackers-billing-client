function escapeHTML(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function generatePrintHTML(billData) {
  const {
    bill_no,
    lines,
    grand_total,
    discount_pct,
    final_total,
    created_at
  } = billData;

  const date = new Date(created_at || Date.now());
  const formattedDate = date.toLocaleDateString('en-IN');
  const formattedTime = date.toLocaleTimeString('en-IN');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Bill #${bill_no}</title>
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        
        @page {
          size: 80mm auto;
          margin: 0;
        }
        
        body {
          font-family: 'Courier New', monospace;
          font-size: 12px;
          line-height: 1.4;
          width: 80mm;
          padding: 5mm;
          background: white;
          margin: 0 auto;
        }
        
        .header {
          text-align: center;
          margin-bottom: 10px;
          border-bottom: 2px dashed #000;
          padding-bottom: 8px;
        }
        
        .shop-name {
          font-size: 18px;
          font-weight: bold;
          margin-bottom: 4px;
        }
        
        .shop-info {
          font-size: 10px;
          margin-bottom: 2px;
        }
        
        .bill-info {
          display: flex;
          justify-content: space-between;
          margin: 8px 0;
          font-size: 11px;
        }
        
        .bill-no {
          font-weight: bold;
        }
        
        .items-table {
          width: 100%;
          margin: 8px 0;
          border-collapse: collapse;
        }
        
        .items-table th {
          border-top: 1px solid #000;
          border-bottom: 1px solid #000;
          padding: 4px 2px;
          text-align: left;
          font-size: 11px;
        }
        
        .items-table td {
          padding: 4px 2px;
          font-size: 11px;
        }
        
        .items-table .right {
          text-align: right;
        }
        
        .items-table .center {
          text-align: center;
        }
        
        .items-table tbody tr:last-child td {
          border-bottom: 1px solid #000;
        }
        
        .totals {
          margin: 8px 0;
          font-size: 11px;
        }
        
        .totals-row {
          display: flex;
          justify-content: space-between;
          padding: 3px 0;
        }
        
        .final-total {
          border-top: 2px solid #000;
          border-bottom: 2px solid #000;
          padding: 6px 0;
          margin-top: 4px;
          font-size: 14px;
          font-weight: bold;
        }
        
        .footer {
          text-align: center;
          margin-top: 12px;
          padding-top: 8px;
          border-top: 2px dashed #000;
          font-size: 10px;
        }
        
        .thank-you {
          font-weight: bold;
          margin-bottom: 4px;
        }
        
        @media print {
          body {
            padding: 2mm;
          }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="shop-name">FIRECRACKERS SHOP</div>
        <div class="shop-info">123 Main Street</div>
        <div class="shop-info">Rajkot, Gujarat - 360001</div>
        <div class="shop-info">Phone: +91-9876543210</div>
        <div class="shop-info">GSTIN: 24XXXXX1234X1ZX</div>
      </div>
      
      <div class="bill-info">
        <span class="bill-no">Bill #: ${bill_no}</span>
        <span class="date">${formattedDate}</span>
      </div>
      
      <div class="bill-info">
        <span class="time">Time: ${formattedTime}</span>
      </div>
      
      <table class="items-table">
        <thead>
          <tr>
            <th style="width: 35%">Item</th>
            <th class="center" style="width: 15%">Qty</th>
            <th class="right" style="width: 25%">Price</th>
            <th class="right" style="width: 25%">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${lines.map(line => `
            <tr>
              <td>${escapeHTML(line.item_name)}</td>
              <td class="center">${line.qty}</td>
              <td class="right">₹${Number(line.price).toFixed(2)}</td>
              <td class="right">₹${(line.qty * line.price).toFixed(2)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      
      <div class="totals">
        <div class="totals-row">
          <span>Subtotal:</span>
          <span>₹${Number(grand_total).toFixed(2)}</span>
        </div>
        
        ${discount_pct > 0 ? `
          <div class="totals-row">
            <span>Discount (${discount_pct}%):</span>
            <span>-₹${(grand_total * discount_pct / 100).toFixed(2)}</span>
          </div>
        ` : ''}
        
        <div class="totals-row final-total">
          <span>TOTAL:</span>
          <span>₹${Number(final_total).toFixed(2)}</span>
        </div>
      </div>
      
      <div class="footer">
        <div class="thank-you">*** THANK YOU ***</div>
        <div>Visit Again!</div>
        <div style="margin-top: 8px;">Goods once sold will not be taken back</div>
      </div>
    </body>
    </html>
  `;
}

async function printBill(billData) {
  try {
    const htmlContent = generatePrintHTML(billData);
    
    if (window.api && window.api.printBill) {
      await window.api.printBill(htmlContent);
    } else {
      const printWindow = window.open('', '_blank', 'width=800,height=600');
      if (printWindow) {
        printWindow.document.write(htmlContent);
        printWindow.document.close();
        
        printWindow.onload = () => {
          setTimeout(() => {
            printWindow.print();
          }, 250);
        };
      } else {
        throw new Error('Could not open print window. Please allow pop-ups.');
      }
    }
  } catch (error) {
    console.error('Print error:', error);
    throw error;
  }
}

window.printerTemplate = {
  generatePrintHTML: generatePrintHTML,
  printBill: printBill
};

console.log('Printer Template loaded successfully');