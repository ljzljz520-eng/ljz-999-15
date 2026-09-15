import { JSDOM } from 'jsdom';
import fs from 'fs';

const html = `<!DOCTYPE html><html><body>
<div id="globalOverlay" class="hidden"></div>
<div id="confirmModal" class="hidden"><h3 id="confirmTitle"></h3><p id="confirmMessage"></p><button id="confirmOkBtn"></button><button id="confirmCancelBtn"></button></div>
<div id="alertModal" class="hidden"><h3 id="alertTitle"></h3><div id="alertMessage"></div><button id="alertOkBtn"></button></div>
<div id="settingsModal" class="hidden"><div class="modal-body"></div></div>
<form id="queryForm"></form>
<input id="facodeInput"><input id="ipInput">
<div id="resultBox" class="hidden"><div id="resultContent"></div></div>
<div id="errorBox" class="hidden"><div id="errorMessage"></div></div>
<div id="loading" class="hidden"></div>
<pre id="curlCommand"></pre>
<div id="historyList"></div><div id="emptyHistory"></div><button id="clearHistoryBtn"></button>
<button id="settingsBtn"></button><button id="closeSettings"></button>
</body></html>`;

const dom = new JSDOM(html, { url: 'http://localhost/', runScripts: 'outside-only' });
const { window } = dom;

// 捕获 CSV 下载
const downloads = [];
window.URL.createObjectURL = (blob) => { downloads.push({ blob }); return 'blob:mock'; };
window.URL.revokeObjectURL = () => {};
window.HTMLAnchorElement.prototype.click = function () {
    downloads[downloads.length - 1].filename = this.download;
};

const code = fs.readFileSync('/workspace/frontend/src/main.js', 'utf8');
window.eval(code);
window.document.dispatchEvent(new window.Event('DOMContentLoaded', { bubbles: true }));

const qm = window.queryManager;
let passed = 0, failed = 0;
function assert(cond, name) {
    if (cond) { passed++; console.log('  PASS', name); }
    else { failed++; console.log('  FAIL', name); }
}

// ---------- 用例1：维修中设备（FA002 场景） ----------
console.log('用例1: 维修中设备完整渲染');
const fa002 = {
    facode: 'FA002', sn: 'SN2024002',
    asset: { model: 'HP ProLiant DL380 Gen10', category: '服务器', purchase_date: '2023-03-10', warranty_end: '2027-03-15', warranty_status: 'active', status: 'in_repair', open_repair_count: 1, checkout_available: false },
    repair: {
        recent_orders: [
            { id: 1, order_no: 'RO-2026-0101', status: 'in_progress', reported_issue: '开机无显示，主板告警灯亮', repair_note: '初步检测为主板电容故障', technician: '张工', created_at: '2026-09-10 09:30:00', closed_at: null },
            { id: 2, order_no: 'RO-2026-0087', status: 'closed', reported_issue: '系统频繁蓝屏', repair_note: '重插内存并更新固件', technician: '张工', created_at: '2026-06-18 14:00:00', closed_at: '2026-06-20 17:30:00' }
        ],
        replaced_parts: [{ part_name: '内存条 DDR4 32G', part_sn: 'MEM-5T8802', replaced_at: '2026-06-19', order_no: 'RO-2026-0087' }],
        open_issues: [{ issue_desc: '主板电容鼓包，存在二次故障风险', severity: 'high', created_at: '2026-09-10 10:00:00' }]
    }
};
qm.showResult(fa002);
let out = window.document.getElementById('resultContent').innerHTML;
assert(out.includes('SN2024002'), '显示 SN');
assert(out.includes('在保'), '显示保修状态');
assert(out.includes('不可领用'), '维修中设备显示不可领用');
assert(out.includes('设备维修中'), '显示不可领用原因');
assert(!out.includes('可正常领用'), '维修中设备不显示"可正常领用"');
assert(out.includes('未关闭问题（1）'), '显示未关闭问题数');
assert(out.includes('主板电容鼓包'), '显示问题描述');
assert(out.includes('RO-2026-0101'), '显示维修单号');
assert(out.includes('初步检测为主板电容故障'), '显示维修备注');
assert(out.includes('内存条 DDR4 32G'), '显示换件记录');
assert(out.includes('MEM-5T8802'), '显示部件序列号');
assert(out.includes('HP ProLiant DL380 Gen10'), '显示设备型号');

// ---------- 用例2：闲置可领用设备（FA001 场景） ----------
console.log('用例2: 正常可领用设备');
qm.showResult({
    facode: 'FA001', sn: 'SN2024001',
    asset: { model: 'Dell R740', category: '服务器', purchase_date: '2024-06-01', warranty_end: '2027-06-30', warranty_status: 'active', status: 'available', open_repair_count: 0, checkout_available: true },
    repair: { recent_orders: [], replaced_parts: [], open_issues: [] }
});
out = window.document.getElementById('resultContent').innerHTML;
assert(out.includes('可正常领用'), '显示可正常领用');
assert(out.includes('暂无维修单记录'), '空维修单显示占位');
assert(out.includes('暂无部件更换记录'), '空换件显示占位');
assert(!out.includes('未关闭问题（'), '无未关闭问题时不显示警示框');

// ---------- 用例3：台账闲置但有未关闭维修单（FA005 场景） ----------
console.log('用例3: 状态为闲置但有未关闭维修单 -> 不可领用');
qm.showResult({
    facode: 'FA005', sn: 'SN2024005',
    asset: { model: 'Cisco 9300', category: '网络设备', purchase_date: '2022-11-20', warranty_end: null, warranty_status: 'unknown', status: 'available', open_repair_count: 1, checkout_available: false },
    repair: { recent_orders: [{ id: 5, order_no: 'RO-2026-0115', status: 'open', reported_issue: '端口掉线', repair_note: null, technician: null, created_at: '2026-09-14 08:45:00', closed_at: null }], replaced_parts: [], open_issues: [] }
});
out = window.document.getElementById('resultContent').innerHTML;
assert(out.includes('不可领用'), '有未关闭维修单 -> 不可领用');
assert(out.includes('1 张未关闭维修单'), '显示未关闭维修单数量');
assert(out.includes('保修未知'), '无保修日期显示未知');

// ---------- 用例4：旧数据源降级（无扩展表） ----------
console.log('用例4: 旧数据源优雅降级');
qm.showResult({ facode: 'TEST-01', sn: 'SN-TEST-001', asset: null, repair: null });
out = window.document.getElementById('resultContent').innerHTML;
assert(out.includes('SN-TEST-001'), '旧数据正常显示 SN');
assert(!out.includes('维修历史'), '不显示维修历史区块');
assert(!out.includes('导出'), '不显示导出区块');

// ---------- 用例5：XSS 防护 ----------
console.log('用例5: 维修备注 XSS 转义');
qm.showResult({
    facode: 'FA009', sn: 'SN009',
    asset: { model: '<script>alert(1)</script>', category: 'x', purchase_date: null, warranty_end: null, warranty_status: 'unknown', status: 'available', open_repair_count: 0, checkout_available: true },
    repair: { recent_orders: [{ id: 9, order_no: 'RO-9', status: 'open', reported_issue: '<img src=x onerror=alert(1)>', repair_note: '<b>bold</b>', technician: null, created_at: '2026-01-01 00:00:00', closed_at: null }], replaced_parts: [], open_issues: [] }
});
out = window.document.getElementById('resultContent').innerHTML;
assert(!out.includes('<script>alert(1)</script>'), '型号中的脚本被转义');
assert(!out.includes('<img src=x'), '报修内容中的 img 被转义');
assert(out.includes('&lt;b&gt;bold&lt;/b&gt;'), '维修备注转义为文本');

// ---------- 用例6：导出分离 ----------
console.log('用例6: 导出文件分离');
qm.showResult(fa002);
downloads.length = 0;
qm.exportBasicInfo();
qm.exportRepairNotes();
assert(downloads.length === 2, '生成两个独立文件');
const basicBytes = new Uint8Array(await downloads[0].blob.arrayBuffer());
const repairBytes = new Uint8Array(await downloads[1].blob.arrayBuffer());
const basicText = await downloads[0].blob.text();
const repairText = await downloads[1].blob.text();
assert(downloads[0].filename.includes('资产基础信息'), '文件1为基础信息');
assert(downloads[1].filename.includes('维修记录'), '文件2为维修记录');
assert(basicBytes[0] === 0xEF && basicBytes[1] === 0xBB && basicBytes[2] === 0xBF, '基础信息 CSV 含 BOM');
assert(repairBytes[0] === 0xEF && repairBytes[1] === 0xBB && repairBytes[2] === 0xBF, '维修记录 CSV 含 BOM');
assert(basicText.includes('SN2024002'), '基础信息含 SN');
assert(basicText.includes('保修状态'), '基础信息含保修状态行');
assert(!basicText.includes('初步检测为主板电容故障'), '基础信息不含维修备注');
assert(!basicText.includes('RO-2026-0101'), '基础信息不含维修单号');
assert(repairText.includes('RO-2026-0101'), '维修记录含维修单号');
assert(repairText.includes('初步检测为主板电容故障'), '维修记录含维修备注');
assert(repairText.includes('内存条 DDR4 32G'), '维修记录含换件');
assert(repairText.includes('主板电容鼓包'), '维修记录含未关闭问题');
assert(!repairText.includes('设备型号'), '维修记录不含资产基础字段');

// CSV 转义：含 ASCII 逗号/引号字段应加引号并双写引号
qm.showResult({
    facode: 'FA010', sn: 'SN010',
    asset: null,
    repair: { recent_orders: [{ id: 10, order_no: 'RO-10', status: 'open', reported_issue: '故障, 待查', repair_note: '备注含"引号"测试', technician: null, created_at: '2026-01-01 00:00:00', closed_at: null }], replaced_parts: [], open_issues: [] }
});
downloads.length = 0;
qm.exportRepairNotes();
const escText = await downloads[0].blob.text();
assert(escText.includes('"故障, 待查"'), '含 ASCII 逗号字段正确加引号');
assert(escText.includes('"备注含""引号""测试"'), '引号字段正确双写转义');

console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
process.exit(failed > 0 ? 1 : 0);
