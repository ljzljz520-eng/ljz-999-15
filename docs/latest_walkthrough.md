# 项目演练与验证记录 (Walkthrough)

**当前版本**: V7.0
**更新时间**: 2026-09-15

## 变更概要 (V7: 维修历史关联查询)

### 1. 需求背景
固定资产序列号查询网关需要关联维修历史：
- 查询设备时可看到保修状态、最近维修单、换过的部件和未关闭问题；
- 维修中设备不能显示为可正常领用；
- 导出时维修备注与资产基础信息分离，避免使用人员看不懂。

### 2. 实现方案

#### 数据库 (mysql-init/init.sql)
新增 4 张表：
- `assets`：型号、类别、采购日期、保修截止、设备状态（available/in_use/in_repair/retired）
- `repair_orders`：维修工单（open/in_progress/closed），含报修问题与维修备注
- `part_replacements`：部件更换记录，外键关联维修单
- `asset_issues`：问题登记（open/closed），含严重程度

#### 后端 (backend/api/query.php)
- 响应新增 `asset`（保修状态派生 + 领用状态派生）与 `repair`（最近 5 条维修单 / 最多 20 条换件 / 未关闭问题）两个节点。
- **领用规则**：`checkout_available = (status === 'available' && 无未关闭维修单)`。即使台账状态误标为"闲置"，只要存在未关闭维修单，依然判定不可领用（双重兜底）。
- **优雅降级**：通过 `information_schema` 检测表是否存在，旧版外部库（仅 facode2sn）返回 `asset/repair = null`，前端按旧版展示。

#### 前端 (frontend/src/main.js)
- 结果页新增三个区块：资产基础信息（保修/状态徽章 + 领用提示条）、维修历史（未关闭问题警示框置顶）、导出区。
- **导出分离**：「资产基础信息 CSV」与「维修记录 CSV」两个独立文件；CSV 带 UTF-8 BOM，Excel 打开中文不乱码；字段含逗号/引号时按 RFC 4180 转义。
- 所有来自数据库的文本（维修备注等）渲染前统一 `escapeHtml`，防 XSS。

### 3. 测试数据场景
| FACode | 场景 | 预期 |
|:-------|:-----|:-----|
| FA001 | 在保闲置无维修 | 可正常领用 |
| FA002 | 维修中+未关闭问题+换件 | 不可领用（设备维修中） |
| FA003 | 过保，维修已关闭 | 可正常领用，已过保 |
| FA004 | 使用中 | 不可领用（已被领用） |
| FA005 | 台账闲置但有未关闭维修单 | 不可领用（派生兜底） |
| TEST-01 | 无扩展信息 | 仅显示 SN（降级） |

## 验证结论
- [x] 前端 jsdom 自动化测试 41 项全部通过（`node tests/dom.test.mjs`）
  - 维修中设备不显示"可正常领用"
  - 未关闭维修单兜底判定
  - 旧数据源降级渲染
  - XSS 转义
  - 导出文件分离、BOM、CSV 转义
- [x] 前端 Vite 构建通过
- [ ] Docker 端到端验证（需部署环境执行 `docker compose down -v && docker compose up -d --build`）

> 历史版本记录见 `docs/project_status.md`。
