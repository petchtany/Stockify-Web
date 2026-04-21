const API_URL = " https://iks5vkbr63.execute-api.ap-southeast-1.amazonaws.com/default/Stockify-GetProducts"; 
const USER_POOL_ID = 'ap-southeast-1_rsYwrROD2'; 
const CLIENT_ID = '4ft97t4m13vm22oen4nt0gbito'; 
const ADMIN_EMAIL = "pongsakorn135600@gmail.com"; 

let productsDB = []; let historyDB = [];
let categoryChart, valueChart;
let base64ImageString = ""; let currentImageUrl = ""; 
let isAdmin = false; 

const userPool = new AmazonCognitoIdentity.CognitoUserPool({ UserPoolId: USER_POOL_ID, ClientId: CLIENT_ID });
checkAuth();

function checkAuth() {
    const user = userPool.getCurrentUser();
    if (user) {
        user.getSession((err, session) => {
            if (err || !session.isValid()) {
                window.location.href = 'login.html';
            } else {
                const idToken = session.getIdToken().getJwtToken();
                const payload = JSON.parse(atob(idToken.split('.')[1]));
                isAdmin = (payload.email === ADMIN_EMAIL);
                
                document.getElementById('main-app').style.display = 'flex';
                if (!isAdmin) document.getElementById('add-btn').style.display = 'none';
                
                applyTheme();
                fetchProducts();
            }
        });
    } else {
        window.location.href = 'login.html';
    }
}

async function fetchProducts() {
    try {
        const res = await fetch(API_URL);
        const data = await res.json();
        let finalData = Array.isArray(data) ? data : (data.body ? (typeof data.body === 'string' ? JSON.parse(data.body) : data.body) : []);
        productsDB = Array.isArray(finalData) ? finalData : [];
        updateDashboard(); renderProducts();
    } catch (e) { console.error("Fetch Error:", e); }
}

async function fetchHistory() {
    try {
        const res = await fetch(`${API_URL}?table=history`);
        const data = await res.json();
        let finalData = Array.isArray(data) ? data : (data.body ? (typeof data.body === 'string' ? JSON.parse(data.body) : data.body) : []);
        historyDB = Array.isArray(finalData) ? finalData : [];
        historyDB.sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
        renderHistory();
        renderOrders(); // 🌟 อัปเดตตารางออเดอร์ด้วย
    } catch (e) { console.error("History Error:", e); }
}

function updateDashboard() { 
    let val = 0; let low = 0;
    productsDB.forEach(p => {
        val += (Number(p.price || 0) * Number(p.stock || 0));
        if (Number(p.stock || 0) <= Number(p.minStock || 5)) low++;
    });
    document.getElementById('dash-total').innerText = productsDB.length;
    document.getElementById('dash-low').innerText = low;
    document.getElementById('dash-value').innerText = val.toLocaleString();
    renderCharts();
}

function renderCharts() {
    const cats = {}; productsDB.forEach(p => cats[p.category] = (cats[p.category] || 0) + 1);
    const chartColors = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];
    if(categoryChart) categoryChart.destroy();
    categoryChart = new Chart(document.getElementById('categoryChart'), { type: 'doughnut', data: { labels: Object.keys(cats), datasets: [{ data: Object.values(cats), backgroundColor: chartColors, borderWidth: 0 }] }, options: { cutout: '70%' } });
    const top5 = productsDB.map(p => ({ n: p.name, v: (p.price||0) * (p.stock||0) })).sort((a,b) => b.v - a.v).slice(0,5);
    if(valueChart) valueChart.destroy();
    valueChart = new Chart(document.getElementById('valueChart'), { type: 'bar', data: { labels: top5.map(x => x.n), datasets: [{ label: 'มูลค่า (บาท)', data: top5.map(x => x.v), backgroundColor: '#6366f1', borderRadius: 6 }] } });
}

function renderProducts() {
    document.getElementById('product-table-body').innerHTML = productsDB.map(p => `
        <tr>
            <td><img src="${p.imageUrl || 'https://placehold.co/40'}" style="width:44px; height:44px; border-radius:8px; object-fit:cover; border: 1px solid var(--border);"></td>
            <td style="font-weight:500;">${p.sku}</td><td>${p.name}</td>
            <td><span style="background:var(--bg-color); padding:4px 8px; border-radius:4px; font-size:12px;">${p.category}</span></td>
            <td>฿${Number(p.price || 0).toLocaleString()}</td>
            <td>
                ${isAdmin ? `
                    <button onclick="editProduct('${p.sku}')" style="color:var(--text-main); background:var(--bg-color); padding:6px 12px; border-radius:6px; border:none; margin-right:4px; cursor:pointer;"><i class="ph ph-pencil-simple"></i> Edit</button>
                    <button onclick="deleteProduct('${p.sku}')" style="color:var(--danger); background:rgba(239,68,68,0.1); padding:6px 12px; border-radius:6px; border:none; cursor:pointer;"><i class="ph ph-trash"></i> Del</button>
                ` : '-'}
            </td>
        </tr>`).join('');

    const stockBody = document.getElementById('stock-table-body');
    if(stockBody) {
        stockBody.innerHTML = productsDB.map(p => {
            const isLow = Number(p.stock) <= Number(p.minStock || 5);
            return `
            <tr>
                <td style="font-weight:500;">${p.sku}</td><td>${p.name}</td>
                <td style="${isLow ? 'color:var(--danger); font-weight:700;' : 'font-weight:600;'}">${p.stock}</td>
                <td>${p.minStock || 5}</td>
                <td><button onclick="openTxModal('${p.sku}', '${p.name}', ${p.stock})" style="color:var(--primary); background:rgba(99,102,241,0.1); padding:6px 12px; border-radius:6px; border:none; cursor:pointer;"><i class="ph ph-arrows-left-right"></i> In/Out</button></td>
            </tr>`;
        }).join('');
    }
}

// 🌟 ระบบวาดตาราง Order (กรองมาเฉพาะที่เป็น PO/SO/Return)
function renderOrders() {
    const orders = historyDB.filter(h => h.note && (h.note.startsWith('PO:') || h.note.startsWith('SO:') || h.note.startsWith('RETURN:')));
    
    document.getElementById('order-table-body').innerHTML = orders.map(h => {
        let orderTypeStr = ''; let color = ''; let bg = '';
        let partner = h.note.split(':')[1] || '-';

        if(h.note.startsWith('PO:')) { orderTypeStr = 'PO (ซื้อเข้า)'; color = 'var(--primary)'; bg = 'rgba(99,102,241,0.1)'; }
        else if(h.note.startsWith('SO:')) { orderTypeStr = 'SO (ขายออก)'; color = 'var(--success)'; bg = 'rgba(16,185,129,0.1)'; }
        else if(h.note.startsWith('RETURN:')) { orderTypeStr = 'Return (รับคืน)'; color = 'var(--danger)'; bg = 'rgba(239,68,68,0.1)'; }

        return `
        <tr>
            <td>${new Date(h.timestamp).toLocaleDateString('th-TH')}</td>
            <td><span style="background:${bg}; color:${color}; padding:4px 8px; border-radius:4px; font-weight:600; font-size:12px;">${orderTypeStr}</span></td>
            <td style="font-weight:500;">${h.sku}</td>
            <td>${partner}</td>
            <td style="font-weight:600;">${h.qty}</td>
        </tr>`;
    }).join('');
}

function renderHistory() {
    document.getElementById('history-table-body').innerHTML = historyDB.map(h => `
        <tr>
            <td>${new Date(h.timestamp).toLocaleString()}</td>
            <td style="font-weight:500;">${h.sku}</td>
            <td><span style="background:${h.type === 'IN' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)'}; color:${h.type === 'IN' ? 'var(--success)' : 'var(--danger)'}; padding:4px 8px; border-radius:4px; font-weight:600; font-size:12px;">${h.type}</span></td>
            <td style="font-weight:600;">${h.qty}</td>
            <td style="color:var(--text-muted);">${h.note || '-'}</td>
        </tr>`).join('');
}

// ระบบสลับหน้าต่าง
document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.onclick = () => {
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.view-section').forEach(v => v.classList.add('hidden')); 
        
        btn.classList.add('active');
        document.getElementById(btn.dataset.target).classList.remove('hidden'); 
        
        const titles = { 'dashboard-view': 'Dashboard Overview', 'products-view': 'Product Catalog', 'stock-view': 'Inventory Management', 'orders-view': 'Order Management', 'history-view': 'Transaction History' };
        document.getElementById('page-title').innerText = titles[btn.dataset.target];
        
        // ถ้ากดมาหน้า History หรือ Orders ให้โหลดข้อมูลใหม่ล่าสุดมาด้วย
        if (btn.dataset.target === 'history-view' || btn.dataset.target === 'orders-view') fetchHistory();
    }
});

// Event Listeners พื้นฐาน
document.getElementById('logout-btn').onclick = () => { userPool.getCurrentUser()?.signOut(); window.location.href = 'login.html'; };
document.getElementById('theme-toggle').onclick = () => {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    document.getElementById('theme-toggle').innerHTML = isDark ? '<i class="ph ph-sun"></i>' : '<i class="ph ph-moon"></i>';
    setTimeout(renderCharts, 50);
};
function applyTheme() {
    const theme = localStorage.getItem('theme') || 'light';
    document.body.classList.toggle('dark-mode', theme === 'dark');
    const btn = document.getElementById('theme-toggle');
    if(btn) btn.innerHTML = theme === 'dark' ? '<i class="ph ph-sun"></i>' : '<i class="ph ph-moon"></i>';
}
document.getElementById('export-btn').onclick = () => {
    if (!productsDB.length) return Swal.fire("Oops!", "ไม่มีข้อมูลให้ Export!", "warning");
    let csv = "data:text/csv;charset=utf-8,\uFEFFSKU,Name,Category,Price,Stock\n";
    productsDB.forEach(p => csv += `${p.sku},${p.name},${p.category},${p.price},${p.stock}\n`);
    const link = document.createElement("a"); link.href = encodeURI(csv); link.download = "Looma_Stock.csv"; link.click();
};

// จัดการสินค้า
document.getElementById('new-image').onchange = (e) => {
    const reader = new FileReader();
    reader.onload = (ev) => { base64ImageString = ev.target.result; document.getElementById('image-preview').src = base64ImageString; document.getElementById('image-preview').style.display = 'block'; };
    reader.readAsDataURL(e.target.files[0]);
};
document.getElementById('add-btn').onclick = () => {
    document.getElementById('add-form').reset(); base64ImageString = ""; currentImageUrl = "";
    document.getElementById('image-preview').style.display = 'none'; document.getElementById('new-sku').readOnly = false;
    document.getElementById('add-modal').classList.remove('hidden');
};
window.editProduct = (sku) => {
    const p = productsDB.find(x => x.sku === sku);
    document.getElementById('new-sku').value = p.sku; document.getElementById('new-sku').readOnly = true;
    document.getElementById('new-name').value = p.name; document.getElementById('new-category').value = p.category;
    document.getElementById('new-price').value = p.price; document.getElementById('new-stock').value = p.stock;
    document.getElementById('new-minstock').value = p.minStock || 5;
    currentImageUrl = p.imageUrl || ""; base64ImageString = "";
    document.getElementById('image-preview').src = currentImageUrl || "";
    document.getElementById('image-preview').style.display = currentImageUrl ? 'block' : 'none';
    document.getElementById('add-modal').classList.remove('hidden');
};
document.getElementById('add-form').onsubmit = async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]'); btn.innerHTML = '<i class="ph ph-spinner-gap"></i> กำลังบันทึก...'; btn.disabled = true;
    const p = { sku: document.getElementById('new-sku').value, name: document.getElementById('new-name').value, category: document.getElementById('new-category').value, price: Number(document.getElementById('new-price').value), stock: Number(document.getElementById('new-stock').value), minStock: Number(document.getElementById('new-minstock').value), imageUrl: currentImageUrl, imageBase64: base64ImageString };
    await fetch(API_URL, { method: 'POST', body: JSON.stringify(p) });
    document.getElementById('add-modal').classList.add('hidden'); btn.innerHTML = '<i class="ph ph-floppy-disk"></i> บันทึก'; btn.disabled = false; Swal.fire("สำเร็จ!", "บันทึกข้อมูลเรียบร้อยแล้ว", "success"); fetchProducts();
};

// 🌟 ระบบจัดการออเดอร์ (PO/SO/Return)
window.openOrderModal = () => {
    const skuSelect = document.getElementById('order-sku');
    // ดึงรายชื่อสินค้าทั้งหมดมาใส่ใน Dropdown
    skuSelect.innerHTML = productsDB.map(p => `<option value="${p.sku}">${p.sku} - ${p.name} (คงเหลือ: ${p.stock})</option>`).join('');
    document.getElementById('order-modal').classList.remove('hidden');
};

document.getElementById('order-form').onsubmit = async (e) => {
    e.preventDefault();
    const orderType = document.getElementById('order-type').value;
    const sku = document.getElementById('order-sku').value;
    const qty = Number(document.getElementById('order-qty').value);
    const partner = document.getElementById('order-partner').value;

    const product = productsDB.find(p => p.sku === sku);
    const currStock = Number(product.stock || 0);
    
    let type = ''; let finalStock = currStock; let notePrefix = '';

    // คำนวณสต็อกตามประเภทออเดอร์
    if (orderType === 'PO') { type = 'IN'; finalStock += qty; notePrefix = 'PO: '; }
    else if (orderType === 'SO') { type = 'OUT'; finalStock -= qty; notePrefix = 'SO: '; }
    else if (orderType === 'RETURN') { type = 'IN'; finalStock += qty; notePrefix = 'RETURN: '; }

    if (finalStock < 0) return Swal.fire("ผิดพลาด!", "สต็อกไม่พอสำหรับการขาย (SO) ครับ!", "error");

    const btn = e.target.querySelector('button[type="submit"]');
    btn.innerHTML = '<i class="ph ph-spinner-gap"></i> Processing...'; btn.disabled = true;

    // ยิง API ตัวเดิม แต่ฝัง Metadata ลงในช่อง Note
    await fetch(API_URL, { 
        method: 'POST', 
        body: JSON.stringify({ action: "TRANSACTION", sku, type, qty, newStock: finalStock, note: notePrefix + partner }) 
    });

    document.getElementById('order-modal').classList.add('hidden'); 
    btn.innerHTML = '<i class="ph ph-check-circle"></i> บันทึกออเดอร์'; btn.disabled = false;
    
    Swal.fire("สำเร็จ!", `บันทึกรายการ ${orderType} ตัดสต็อกเรียบร้อยแล้ว`, "success");
    fetchProducts();
    fetchHistory(); // รีเฟรชตาราง Orders
};

// In/Out ธรรมดา
window.openTxModal = (sku, name, stock) => {
    document.getElementById('tx-sku').value = sku; document.getElementById('tx-current-stock').value = stock;
    document.getElementById('tx-sku-display').innerText = `📦 ${name} (คงเหลือ: ${stock} ชิ้น)`;
    document.getElementById('tx-modal').classList.remove('hidden');
};
document.getElementById('tx-form').onsubmit = async (e) => {
    e.preventDefault();
    const type = document.getElementById('tx-type').value; const qty = Number(document.getElementById('tx-qty').value);
    const curr = Number(document.getElementById('tx-current-stock').value);
    const finalStock = type === 'IN' ? curr + qty : curr - qty;
    if (finalStock < 0) return Swal.fire("ผิดพลาด!", "สต็อกไม่พอเบิกครับ!", "error");
    await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: "TRANSACTION", sku: document.getElementById('tx-sku').value, type, qty, newStock: finalStock, note: document.getElementById('tx-note').value }) });
    document.getElementById('tx-modal').classList.add('hidden'); Swal.fire("เรียบร้อย!", `ทำรายการสำเร็จ`, "success"); fetchProducts();
};
window.deleteProduct = async (sku) => {
    const result = await Swal.fire({ title: 'ยืนยันการลบ?', text: "ลบแล้วจะไม่สามารถกู้คืนได้นะครับ!", icon: 'warning', showCancelButton: true, confirmButtonColor: '#ef4444', cancelButtonColor: '#9ca3af', confirmButtonText: 'ใช่, ลบเลย!' });
    if (result.isConfirmed) { await fetch(API_URL, { method: 'DELETE', body: JSON.stringify({sku}) }); Swal.fire('ลบแล้ว!', 'ลบสินค้าเรียบร้อยครับ', 'success'); fetchProducts(); }
};