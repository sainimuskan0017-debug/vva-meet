<?php
/**
 * VVA Meet - Automated MySQL Database Setup & Diagnostic Wizard
 * Tailored for BigRock Linux Hosting (cPanel / Apache / MySQL)
 */

require_once __DIR__ . '/config.php';

$step = $_GET['step'] ?? 'check';
$action = $_POST['action'] ?? '';

$dbError = null;
$dbSuccess = false;
$tablesStatus = [];
$tablesCreated = false;

// Check connection
$dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=%s', DB_HOST, (int)DB_PORT, DB_NAME, DB_CHARSET);

try {
    $pdo = new PDO($dsn, DB_USER, DB_PASS, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC
    ]);
    $dbSuccess = true;
} catch (PDOException $e) {
    $dbError = $e->getMessage();
}

// Handle table creation action
if ($action === 'create_tables' && $dbSuccess) {
    require_once __DIR__ . '/database.php';
    try {
        Database::initDatabaseTables();
        $tablesCreated = true;
    } catch (Exception $e) {
        $dbError = 'Table initialization failed: ' . $e->getMessage();
    }
}

// Check table existence if connected
$tableNames = ['users', 'rooms', 'messages', 'sessions', 'participants', 'reactions', 'signals'];
if ($dbSuccess) {
    foreach ($tableNames as $tbl) {
        try {
            $stmt = $pdo->query("SHOW TABLES LIKE '{$tbl}'");
            $tablesStatus[$tbl] = (bool)$stmt->fetch();
        } catch (Exception $e) {
            $tablesStatus[$tbl] = false;
        }
    }
}

$allTablesExist = !empty($tablesStatus) && !in_array(false, $tablesStatus, true);
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>VVA Meet - BigRock MySQL Setup Wizard</title>
  <link rel="stylesheet" href="css/main.css">
  <style>
    body {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px 16px;
      background: radial-gradient(circle at 50% 20%, #151c2e 0%, #070a12 100%);
    }
    .wizard-card {
      width: 100%;
      max-width: 680px;
      padding: 36px 32px;
      background: rgba(15, 23, 42, 0.75);
      backdrop-filter: blur(16px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 20px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
    }
    .wizard-header {
      text-align: center;
      margin-bottom: 28px;
    }
    .wizard-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 12px;
      background: rgba(99, 102, 241, 0.15);
      border: 1px solid rgba(99, 102, 241, 0.3);
      border-radius: 999px;
      font-size: 0.75rem;
      font-weight: 600;
      color: #818cf8;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 12px;
    }
    .status-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 0.8rem;
      font-weight: 600;
    }
    .status-pill.success {
      background: rgba(16, 185, 129, 0.15);
      color: #34d399;
      border: 1px solid rgba(16, 185, 129, 0.3);
    }
    .status-pill.error {
      background: rgba(239, 68, 68, 0.15);
      color: #f87171;
      border: 1px solid rgba(239, 68, 68, 0.3);
    }
    .info-table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
      font-size: 0.9rem;
    }
    .info-table th, .info-table td {
      padding: 10px 14px;
      text-align: left;
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    }
    .info-table th {
      color: var(--text-muted);
      font-weight: 500;
    }
    .table-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
      gap: 8px;
      margin: 16px 0;
    }
    .table-item {
      padding: 10px 12px;
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.06);
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.82rem;
    }
    .alert-box {
      padding: 14px 16px;
      border-radius: 10px;
      margin-bottom: 20px;
      font-size: 0.88rem;
      line-height: 1.5;
    }
    .alert-danger {
      background: rgba(239, 68, 68, 0.12);
      border: 1px solid rgba(239, 68, 68, 0.3);
      color: #fca5a5;
    }
    .alert-success {
      background: rgba(16, 185, 129, 0.12);
      border: 1px solid rgba(16, 185, 129, 0.3);
      color: #6ee7b7;
    }
    .btn-action {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 12px 24px;
      border-radius: 10px;
      font-weight: 600;
      font-size: 0.95rem;
      cursor: pointer;
      text-decoration: none;
      transition: all 0.2s ease;
      border: none;
      width: 100%;
    }
    .btn-primary-gradient {
      background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
      color: #ffffff;
      box-shadow: 0 4px 14px rgba(79, 70, 229, 0.4);
    }
    .btn-primary-gradient:hover {
      background: linear-gradient(135deg, #4f46e5 0%, #4338ca 100%);
      transform: translateY(-1px);
    }
    .btn-success-gradient {
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      color: #ffffff;
      box-shadow: 0 4px 14px rgba(16, 185, 129, 0.4);
    }
    .btn-success-gradient:hover {
      background: linear-gradient(135deg, #059669 0%, #047857 100%);
      transform: translateY(-1px);
    }
  </style>
</head>
<body>
  <div class="wizard-card">
    <div class="wizard-header">
      <div class="wizard-badge">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>
        BigRock cPanel Deployment
      </div>
      <h1 style="font-size: 1.5rem; font-weight: 700; margin-bottom: 6px;">VVA Meet Setup Wizard</h1>
      <p style="color: var(--text-muted); font-size: 0.9rem;">Verifying your PHP & MySQL database connection on BigRock hosting.</p>
    </div>

    <!-- PHP & Server Environment Check -->
    <table class="info-table">
      <tr>
        <th>PHP Version</th>
        <td><strong><?= PHP_VERSION ?></strong> (7.4+ compatible)</td>
        <td><span class="status-pill success">✓ Supported</span></td>
      </tr>
      <tr>
        <th>PDO MySQL Extension</th>
        <td><?= extension_loaded('pdo_mysql') ? 'Installed & Active' : 'Missing' ?></td>
        <td>
          <?php if (extension_loaded('pdo_mysql')): ?>
            <span class="status-pill success">✓ Active</span>
          <?php else: ?>
            <span class="status-pill error">✗ Missing</span>
          <?php endif; ?>
        </td>
      </tr>
      <tr>
        <th>MySQL Host</th>
        <td><code><?= htmlspecialchars(DB_HOST) ?>:<?= (int)DB_PORT ?></code></td>
        <td><span class="status-pill success">Configured</span></td>
      </tr>
      <tr>
        <th>Database Name</th>
        <td><code><?= htmlspecialchars(DB_NAME) ?></code></td>
        <td>
          <?php if ($dbSuccess): ?>
            <span class="status-pill success">✓ Connected</span>
          <?php else: ?>
            <span class="status-pill error">✗ Unreachable</span>
          <?php endif; ?>
        </td>
      </tr>
    </table>

    <?php if ($tablesCreated): ?>
      <div class="alert-box alert-success">
        <strong>🎉 Success!</strong> All 7 database tables have been initialized in your MySQL database!
      </div>
    <?php endif; ?>

    <?php if (!$dbSuccess): ?>
      <div class="alert-box alert-danger">
        <strong>⚠️ Database Connection Failed:</strong><br>
        <code><?= htmlspecialchars($dbError) ?></code>
        <div style="margin-top: 10px; font-size: 0.85rem;">
          <strong>Quick Fix for BigRock cPanel:</strong>
          <ol style="margin-left: 20px; margin-top: 6px;">
            <li>Log into your BigRock cPanel dashboard.</li>
            <li>Go to <strong>MySQL Databases</strong> and confirm your database name, user, and password.</li>
            <li>Make sure you assigned the user to the database with <strong>ALL PRIVILEGES</strong>.</li>
            <li>Open <kbd>config.php</kbd> in your cPanel File Manager and enter the matching credentials.</li>
            <li>Refresh this page.</li>
          </ol>
        </div>
      </div>
    <?php else: ?>
      <!-- Table Verification Grid -->
      <div style="margin: 20px 0;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <h3 style="font-size: 0.95rem; font-weight: 600;">MySQL Database Tables Status</h3>
          <span style="font-size: 0.8rem; color: var(--text-muted);"><?= count(array_filter($tablesStatus)) ?> of <?= count($tablesStatus) ?> Ready</span>
        </div>
        <div class="table-grid">
          <?php foreach ($tablesStatus as $tableName => $exists): ?>
            <div class="table-item">
              <span style="font-family: monospace;"><?= $tableName ?></span>
              <?php if ($exists): ?>
                <span style="color: #34d399; font-weight: bold;">✓ Ready</span>
              <?php else: ?>
                <span style="color: #f87171;">Missing</span>
              <?php endif; ?>
            </div>
          <?php endforeach; ?>
        </div>
      </div>

      <!-- Actions -->
      <?php if (!$allTablesExist): ?>
        <form method="POST" style="margin-top: 24px;">
          <input type="hidden" name="action" value="create_tables">
          <button type="submit" class="btn-action btn-primary-gradient">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
            Initialize Database Tables (1-Click)
          </button>
        </form>
      <?php else: ?>
        <div style="margin-top: 24px; display: flex; flex-direction: column; gap: 12px;">
          <a href="index.php" class="btn-action btn-success-gradient">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
            Launch VVA Meet Conference
          </a>
          <a href="schema.sql" download class="btn-action" style="background: rgba(255,255,255,0.06); color: var(--text-normal); font-size: 0.85rem;">
            Download schema.sql (For manual phpMyAdmin import)
          </a>
        </div>
      <?php endif; ?>
    <?php endif; ?>

    <div style="text-align: center; margin-top: 24px; font-size: 0.78rem; color: var(--text-muted);">
      VVA Meet &bull; Powered by PHP PDO & MySQL &bull; BigRock Hosting Ready
    </div>
  </div>
</body>
</html>
