# FAQuery API 文档

## 1. 固定资产查询接口

根据固定资产编码 (FACode) 查询序列号 (SN)、保修状态与维修历史。

### 端点信息
- **URL**: `/api/query.php`
- **Method**: `GET` 或 `POST`
- **Content-Type**: `application/json`

### 请求参数

| 参数名 | 类型 | 必选 | 说明 | 示例 |
|:-------|:-----|:-----|:-----|:-----|
| `facode` | string | 是 | 固定资产编码 | `FA001` |

### 响应结构

响应总是返回 JSON 格式（UTF-8，中文不转义）。

#### 成功响应 (HTTP 200)

**场景 1：找到数据（含扩展信息）**

```json
{
  "success": true,
  "data": {
    "facode": "FA002",
    "sn": "SN2024002",
    "asset": {
      "model": "HP ProLiant DL380 Gen10",
      "category": "服务器",
      "purchase_date": "2023-03-10",
      "warranty_end": "2027-03-15",
      "warranty_status": "active",
      "status": "in_repair",
      "open_repair_count": 1,
      "checkout_available": false
    },
    "repair": {
      "recent_orders": [
        {
          "id": 1,
          "order_no": "RO-2026-0101",
          "status": "in_progress",
          "reported_issue": "开机无显示，主板告警灯亮",
          "repair_note": "初步检测为主板电容故障，已申请备件，待更换主板。",
          "technician": "张工",
          "created_at": "2026-09-10 09:30:00",
          "closed_at": null
        }
      ],
      "replaced_parts": [
        {
          "part_name": "内存条 DDR4 32G",
          "part_sn": "MEM-5T8802",
          "replaced_at": "2026-06-19",
          "order_no": "RO-2026-0087"
        }
      ],
      "open_issues": [
        {
          "issue_desc": "主板电容鼓包，存在二次故障风险，需更换主板后观察一周。",
          "severity": "high",
          "created_at": "2026-09-10 10:00:00"
        }
      ]
    }
  }
}
```

**字段说明**

| 字段 | 类型 | 说明 |
|:-----|:-----|:-----|
| `asset.warranty_status` | string | 保修状态：`active`(在保) / `expired`(过保) / `unknown`(无保修日期) |
| `asset.status` | string | 设备状态：`available`(闲置) / `in_use`(使用中) / `in_repair`(维修中) / `retired`(已报废) |
| `asset.open_repair_count` | int | 未关闭维修单数量（状态 ≠ closed） |
| `asset.checkout_available` | bool | 是否可正常领用。**仅当设备闲置且无未关闭维修单时为 `true`** |
| `repair.recent_orders` | array | 最近维修单（最多 5 条，按报修时间倒序） |
| `repair.replaced_parts` | array | 部件更换记录（最多 20 条，关联维修单号） |
| `repair.open_issues` | array | 未关闭问题清单 |

> **领用规则**：`status = in_repair` 或存在未关闭维修单的设备，`checkout_available` 恒为 `false`，前端不得显示为"可正常领用"。

> **降级说明**：若数据源只有 `facode2sn` 基础表（如旧版外部库），`asset` 与 `repair` 返回 `null`，前端按旧版样式仅展示 SN。

**场景 2：未找到数据**
```json
{
  "success": true,
  "data": null
}
```

#### 错误响应 (HTTP 400)

**场景：缺少参数**
```json
{
  "success": false,
  "error": "缺少 facode 参数"
}
```

### CURL 调用示例

```bash
# GET 请求
curl "http://localhost:8080/api/query.php?facode=FA001"

# POST 请求
curl -X POST "http://localhost:8080/api/query.php" -d "facode=FA001"
```

## 2. 数据表结构（V7 新增）

| 表名 | 说明 |
|:-----|:-----|
| `facode2sn` | FACode → SN 映射（基础表） |
| `assets` | 资产基础信息：型号、类别、采购日期、保修截止、设备状态 |
| `repair_orders` | 维修工单：单号、状态(open/in_progress/closed)、报修问题、维修备注、维修人 |
| `part_replacements` | 部件更换记录（外键关联维修单） |
| `asset_issues` | 问题登记：描述、严重程度(low/medium/high/critical)、状态(open/closed) |
