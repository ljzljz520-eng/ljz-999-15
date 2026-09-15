CREATE DATABASE IF NOT EXISTS fixed_assets;
USE fixed_assets;

-- ============================================================
-- 基础映射表（V1 遗留，保持兼容）
-- ============================================================
CREATE TABLE IF NOT EXISTS facode2sn (
    id INT AUTO_INCREMENT PRIMARY KEY,
    facode VARCHAR(50) NOT NULL UNIQUE,
    sn VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 资产基础信息表（保修、设备状态）
-- status: available(闲置可领用) / in_use(使用中) / in_repair(维修中) / retired(已报废)
-- ============================================================
CREATE TABLE IF NOT EXISTS assets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    facode VARCHAR(50) NOT NULL UNIQUE,
    model VARCHAR(100) DEFAULT NULL COMMENT '设备型号',
    category VARCHAR(50) DEFAULT NULL COMMENT '资产类别',
    purchase_date DATE DEFAULT NULL COMMENT '采购日期',
    warranty_end DATE DEFAULT NULL COMMENT '保修截止日期',
    status VARCHAR(20) NOT NULL DEFAULT 'available' COMMENT '设备状态',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_status (status)
);

-- ============================================================
-- 维修工单表
-- status: open(待处理) / in_progress(维修中) / closed(已关闭)
-- ============================================================
CREATE TABLE IF NOT EXISTS repair_orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_no VARCHAR(50) NOT NULL UNIQUE COMMENT '维修单号',
    facode VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'open' COMMENT '工单状态',
    reported_issue TEXT COMMENT '报修问题描述',
    repair_note TEXT COMMENT '维修备注',
    technician VARCHAR(50) DEFAULT NULL COMMENT '维修人员',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '报修时间',
    closed_at TIMESTAMP NULL DEFAULT NULL COMMENT '关闭时间',
    INDEX idx_facode (facode),
    INDEX idx_status (status)
);

-- ============================================================
-- 部件更换记录表（挂在维修单下）
-- ============================================================
CREATE TABLE IF NOT EXISTS part_replacements (
    id INT AUTO_INCREMENT PRIMARY KEY,
    repair_order_id INT NOT NULL,
    part_name VARCHAR(100) NOT NULL COMMENT '部件名称',
    part_sn VARCHAR(100) DEFAULT NULL COMMENT '部件序列号',
    replaced_at DATE DEFAULT NULL COMMENT '更换日期',
    CONSTRAINT fk_part_order FOREIGN KEY (repair_order_id) REFERENCES repair_orders(id) ON DELETE CASCADE,
    INDEX idx_order (repair_order_id)
);

-- ============================================================
-- 资产问题登记表（未关闭问题来源）
-- severity: low / medium / high / critical
-- status: open / closed
-- ============================================================
CREATE TABLE IF NOT EXISTS asset_issues (
    id INT AUTO_INCREMENT PRIMARY KEY,
    facode VARCHAR(50) NOT NULL,
    issue_desc TEXT NOT NULL COMMENT '问题描述',
    severity VARCHAR(20) NOT NULL DEFAULT 'medium' COMMENT '严重程度',
    status VARCHAR(20) NOT NULL DEFAULT 'open' COMMENT '问题状态',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '登记时间',
    closed_at TIMESTAMP NULL DEFAULT NULL,
    INDEX idx_facode (facode),
    INDEX idx_status (status)
);

-- ============================================================
-- 测试数据
-- ============================================================
INSERT INTO facode2sn (facode, sn) VALUES
('FA001', 'SN2024001'),
('FA002', 'SN2024002'),
('FA003', 'SN2024003'),
('FA004', 'SN2024004'),
('FA005', 'SN2024005'),
('TEST-01', 'SN-TEST-001');

-- FA001: 在保、闲置、无维修记录 -> 可正常领用
-- FA002: 维修中（有未关闭维修单 + 未关闭问题）-> 不可领用
-- FA003: 已过保、有历史维修（已关闭）、换过部件 -> 可正常领用
-- FA004: 在保、使用中（已领用）-> 不可领用
-- FA005: 台账状态为闲置但挂着一张未关闭维修单 -> 不可领用（派生逻辑兜底）
-- TEST-01: 无扩展信息（模拟旧数据，验证降级展示）
INSERT INTO assets (facode, model, category, purchase_date, warranty_end, status) VALUES
('FA001', 'Dell PowerEdge R740', '服务器', '2024-06-01', '2027-06-30', 'available'),
('FA002', 'HP ProLiant DL380 Gen10', '服务器', '2023-03-10', '2027-03-15', 'in_repair'),
('FA003', 'Lenovo ThinkStation P520', '工作站', '2021-08-01', '2024-08-20', 'available'),
('FA004', 'Dell OptiPlex 7010', '办公电脑', '2024-01-05', '2026-12-31', 'in_use'),
('FA005', 'Cisco Catalyst 9300', '网络设备', '2022-11-20', NULL, 'available');

INSERT INTO repair_orders (order_no, facode, status, reported_issue, repair_note, technician, created_at, closed_at) VALUES
('RO-2026-0101', 'FA002', 'in_progress', '开机无显示，主板告警灯亮', '初步检测为主板电容故障，已申请备件，待更换主板。', '张工', '2026-09-10 09:30:00', NULL),
('RO-2026-0087', 'FA002', 'closed', '系统频繁蓝屏', '重插内存并更新固件后恢复正常。', '张工', '2026-06-18 14:00:00', '2026-06-20 17:30:00'),
('RO-2025-0450', 'FA003', 'closed', '硬盘坏道导致读取缓慢', '更换原厂 1TB SSD，数据已迁移。', '李工', '2025-11-02 10:00:00', '2025-11-03 16:00:00'),
('RO-2024-0312', 'FA003', 'closed', '电源风扇异响', '更换电源风扇，噪音消除。', '李工', '2024-05-12 09:00:00', '2024-05-12 18:00:00'),
('RO-2026-0115', 'FA005', 'open', '端口 24 频繁掉线', NULL, NULL, '2026-09-14 08:45:00', NULL);

INSERT INTO part_replacements (repair_order_id, part_name, part_sn, replaced_at) VALUES
(3, 'SSD 固态硬盘 1TB', 'SSD-9X2K41', '2025-11-03'),
(4, '电源风扇', 'FAN-77B210', '2024-05-12'),
(2, '内存条 DDR4 32G', 'MEM-5T8802', '2026-06-19');

INSERT INTO asset_issues (facode, issue_desc, severity, status, created_at, closed_at) VALUES
('FA002', '主板电容鼓包，存在二次故障风险，需更换主板后观察一周。', 'high', 'open', '2026-09-10 10:00:00', NULL),
('FA002', '机柜导轨松动，上架时需注意固定。', 'low', 'open', '2026-09-11 15:20:00', NULL),
('FA003', '机箱侧板卡扣损坏（不影响使用）。', 'low', 'closed', '2025-11-02 11:00:00', '2025-11-03 16:00:00'),
('FA005', '端口 24 掉线原因待查，疑似光模块老化。', 'medium', 'open', '2026-09-14 09:00:00', NULL);

-- 创建 api 用户 (适配用户测试场景)
CREATE USER IF NOT EXISTS 'api'@'%' IDENTIFIED BY 'FJzzCT#api';
GRANT SELECT ON fixed_assets.* TO 'api'@'%';
FLUSH PRIVILEGES;
