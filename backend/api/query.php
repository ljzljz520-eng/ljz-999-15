<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-DB-CONNECTION, X-DB-HOST, X-DB-PORT, X-DB-NAME, X-DB-USER, X-DB-PASSWORD');

// 处理 OPTIONS 请求（预检请求）
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once __DIR__ . '/../config/database.php';

/**
 * 检查表是否存在（外部数据库可能只有 facode2sn 基础表，需优雅降级）
 * 使用 information_schema 标准查询，兼容原生/模拟两种预处理模式
 */
function tableExists($pdo, $table)
{
    try {
        $stmt = $pdo->prepare(
            "SELECT COUNT(*) FROM information_schema.TABLES
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?"
        );
        $stmt->execute([$table]);
        return (int)$stmt->fetchColumn() > 0;
    } catch (Exception $e) {
        return false;
    }
}

try {
    // 检查 facode 参数
    $facode = isset($_GET['facode']) ? $_GET['facode'] : (isset($_POST['facode']) ? $_POST['facode'] : null);

    if (!$facode) {
        throw new Exception('缺少 facode 参数');
    }

    // 连接数据库
    $db = new Database();
    $pdo = $db->connect();

    // 1. 基础查询：facode -> sn
    $stmt = $pdo->prepare("SELECT facode, sn FROM facode2sn WHERE facode = :facode");
    $stmt->execute(['facode' => $facode]);
    $base = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$base) {
        echo json_encode(['success' => true, 'data' => null], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $data = [
        'facode' => $base['facode'],
        'sn'     => $base['sn'],
        'asset'  => null,   // 资产基础信息（保修/状态）
        'repair' => null,   // 维修历史（维修单/换件/未关闭问题）
    ];

    // 2. 资产基础信息（型号、保修、状态）
    if (tableExists($pdo, 'assets')) {
        $stmt = $pdo->prepare("SELECT model, category, purchase_date, warranty_end, status FROM assets WHERE facode = ?");
        $stmt->execute([$facode]);
        $info = $stmt->fetch(PDO::FETCH_ASSOC);

        if ($info) {
            // 保修状态派生：active(在保) / expired(过保) / unknown(未知)
            $warrantyStatus = 'unknown';
            if (!empty($info['warranty_end'])) {
                $warrantyStatus = ($info['warranty_end'] >= date('Y-m-d')) ? 'active' : 'expired';
            }

            $data['asset'] = [
                'model'           => $info['model'],
                'category'        => $info['category'],
                'purchase_date'   => $info['purchase_date'],
                'warranty_end'    => $info['warranty_end'],
                'warranty_status' => $warrantyStatus,
                'status'          => $info['status'],
            ];
        }
    }

    // 3. 维修历史
    $openRepairCount = 0;
    $hasRepairOrders = tableExists($pdo, 'repair_orders');
    $hasIssues       = tableExists($pdo, 'asset_issues');

    if ($hasRepairOrders || $hasIssues) {
        $data['repair'] = [
            'recent_orders'  => [],
            'replaced_parts' => [],
            'open_issues'    => [],
        ];
    }

    if ($hasRepairOrders) {
        // 最近维修单（最多 5 条，新的在前）
        $stmt = $pdo->prepare(
            "SELECT id, order_no, status, reported_issue, repair_note, technician, created_at, closed_at
             FROM repair_orders WHERE facode = ? ORDER BY created_at DESC LIMIT 5"
        );
        $stmt->execute([$facode]);
        $data['repair']['recent_orders'] = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // 未关闭维修单数量（用于派生领用状态）
        $stmt = $pdo->prepare("SELECT COUNT(*) FROM repair_orders WHERE facode = ? AND status <> 'closed'");
        $stmt->execute([$facode]);
        $openRepairCount = (int)$stmt->fetchColumn();

        // 换过的部件（关联维修单，最多 20 条）
        if (tableExists($pdo, 'part_replacements')) {
            $stmt = $pdo->prepare(
                "SELECT p.part_name, p.part_sn, p.replaced_at, r.order_no
                 FROM part_replacements p
                 JOIN repair_orders r ON p.repair_order_id = r.id
                 WHERE r.facode = ? ORDER BY p.replaced_at DESC, p.id DESC LIMIT 20"
            );
            $stmt->execute([$facode]);
            $data['repair']['replaced_parts'] = $stmt->fetchAll(PDO::FETCH_ASSOC);
        }
    }

    if ($hasIssues) {
        // 未关闭问题
        $stmt = $pdo->prepare(
            "SELECT issue_desc, severity, created_at
             FROM asset_issues WHERE facode = ? AND status = 'open' ORDER BY created_at DESC"
        );
        $stmt->execute([$facode]);
        $data['repair']['open_issues'] = $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    // 4. 领用状态派生：维修中设备（状态为 in_repair 或存在未关闭维修单）不可正常领用
    if ($data['asset'] !== null) {
        $data['asset']['open_repair_count']  = $openRepairCount;
        $data['asset']['checkout_available'] = ($data['asset']['status'] === 'available' && $openRepairCount === 0);
    }

    echo json_encode(['success' => true, 'data' => $data], JSON_UNESCAPED_UNICODE);

} catch (Exception $e) {
    http_response_code(400); // Bad Request
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage()
    ], JSON_UNESCAPED_UNICODE);
}
