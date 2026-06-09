import Database from 'better-sqlite3'
import path from 'path'

const dbPath = path.join(process.cwd(), 'data.db')
const db = new Database(dbPath)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
  CREATE TABLE IF NOT EXISTS buildings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    address TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS floor_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    building_id INTEGER NOT NULL REFERENCES buildings(id),
    name TEXT NOT NULL,
    image_path TEXT,
    display_order INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS defect_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    icon TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS vendors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    contact_person TEXT,
    phone TEXT,
    specialty TEXT
  );

  CREATE TABLE IF NOT EXISTS defects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    case_number TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    description TEXT,
    building_id INTEGER REFERENCES buildings(id),
    floor_plan_id INTEGER REFERENCES floor_plans(id),
    location_x REAL,
    location_y REAL,
    location_text TEXT,
    category_id INTEGER REFERENCES defect_categories(id),
    severity TEXT NOT NULL DEFAULT 'medium',
    status TEXT NOT NULL DEFAULT 'open',
    cost_type TEXT NOT NULL DEFAULT 'our',
    reporter_name TEXT,
    reporter_phone TEXT,
    assigned_vendor_id INTEGER REFERENCES vendors(id),
    manager_name TEXT,
    recurrence_count INTEGER DEFAULT 0,
    first_occurred_at TEXT,
    last_occurred_at TEXT,
    total_cost INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS defect_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    defect_id INTEGER NOT NULL REFERENCES defects(id) ON DELETE CASCADE,
    log_type TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT,
    cost_amount INTEGER,
    occurred_at TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS defect_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    defect_id INTEGER NOT NULL REFERENCES defects(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    file_type TEXT,
    original_name TEXT,
    uploaded_at TEXT DEFAULT (datetime('now'))
  );
`)

// Clear existing data
db.exec(`
  DELETE FROM defect_files;
  DELETE FROM defect_logs;
  DELETE FROM defects;
  DELETE FROM vendors;
  DELETE FROM defect_categories;
  DELETE FROM floor_plans;
  DELETE FROM buildings;
`)

// Reset autoincrement
db.exec(`
  DELETE FROM sqlite_sequence WHERE name IN ('buildings','floor_plans','defect_categories','vendors','defects','defect_logs','defect_files');
`)

// Buildings
db.prepare(`INSERT INTO buildings (id, name, address) VALUES (?, ?, ?)`).run(
  1, '본관', '서울특별시 송파구 올림픽로 300'
)

// Floor plans
const floors = [
  [1, 1, '지하2층', '/floor-plans/b2.svg', 1],
  [2, 1, '지하1층', '/floor-plans/b1.svg', 2],
  [3, 1, '1층',     '/floor-plans/f1.svg', 3],
  [4, 1, '2층',     '/floor-plans/f2.svg', 4],
  [5, 1, '3층',     '/floor-plans/f3.svg', 5],
]
const insertFloor = db.prepare(`INSERT INTO floor_plans (id, building_id, name, image_path, display_order) VALUES (?, ?, ?, ?, ?)`)
for (const f of floors) insertFloor.run(...f as [number,number,string,string,number])

// Categories
const categories = [
  [1, '누수', '#3B82F6', 'fa-droplet'],
  [2, '전기', '#F59E0B', 'fa-bolt'],
  [3, 'HVAC', '#10B981', 'fa-wind'],
  [4, '균열', '#EF4444', 'fa-triangle-exclamation'],
]
const insertCat = db.prepare(`INSERT INTO defect_categories (id, name, color, icon) VALUES (?, ?, ?, ?)`)
for (const c of categories) insertCat.run(...c as [number,string,string,string])

// Vendors
const vendors = [
  [1, '국보디자인',     '홍담당',   '02-1234-5678', '방수/누수'],
  [2, '한국설비(주)',   '이담당',   '02-2345-6789', '기계설비'],
  [3, '삼성전기서비스', '박담당',   '02-3456-7890', '전기'],
  [4, '쾌적공조(주)',   '최담당',   '02-4567-8901', 'HVAC/공조'],
]
const insertVendor = db.prepare(`INSERT INTO vendors (id, name, contact_person, phone, specialty) VALUES (?, ?, ?, ?, ?)`)
for (const v of vendors) insertVendor.run(...v as [number,string,string,string,string])

// Defects (원본 5건)
const insertDefect = db.prepare(`
  INSERT INTO defects (id, case_number, title, description, building_id, floor_plan_id,
    location_x, location_y, location_text, category_id, severity, status, cost_type,
    reporter_name, assigned_vendor_id, manager_name, recurrence_count,
    first_occurred_at, last_occurred_at, total_cost, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`)

const defects = [
  [1, 'DEF-2024-001', '지하1층 주차장 누수', '주차장 천장에서 물이 새고 있음. 비가 올 때마다 심해짐',
   1, 2, 35.5, 60.2, '지하1층 주차장 A구역', 1, 'high', 'in_progress', 'gukbo',
   '홍길동(시설팀)', 1, '김관리', 2,
   '2024-03-15 09:00:00', '2024-11-20 14:30:00', 850000, '2026-04-16 07:13:47', '2026-04-16 07:13:47'],
  [2, 'DEF-2024-002', '3층 전기실 분전반 이상', '분전반에서 이상 소음 발생, 주기적 점검 필요',
   1, 5, 70.0, 30.0, '3층 전기실', 2, 'critical', 'completed', 'our',
   '이시설(시설팀)', 3, '김관리', 0,
   '2024-04-10 11:00:00', '2024-09-05 16:00:00', 1200000, '2026-04-16 07:13:47', '2026-04-16 07:13:47'],
  [3, 'DEF-2024-003', '2층 사무실 에어컨 냉방 불량', '냉방 효율 저하, 여름철 실내 온도 유지 어려움',
   1, 4, 50.0, 50.0, '2층 201호 사무실', 3, 'medium', 'open', 'our',
   '박시설(시설팀)', 4, '김관리', 1,
   '2024-06-01 10:00:00', '2024-08-15 09:00:00', 320000, '2026-04-16 07:13:47', '2026-04-16 07:13:47'],
  [4, 'DEF-2024-004', '1층 로비 바닥 균열', '로비 대리석 바닥 균열 발생',
   1, 3, 45.0, 75.0, '1층 로비 중앙', 4, 'low', 'completed', 'claim',
   '홍길동(시설팀)', null, '김관리', 0,
   '2024-07-20 13:00:00', '2024-07-20 13:00:00', 0, '2026-04-16 07:13:47', '2026-04-16 07:13:47'],
  [5, 'DEF-2025-001', '지하2층 기계실 배관 누수', '기계실 급수배관 조인트 누수',
   1, 1, 20.0, 40.0, '지하2층 기계실', 1, 'high', 'in_progress', 'gukbo',
   '이시설(시설팀)', 2, '김관리', 0,
   '2025-01-10 08:00:00', '2025-01-10 08:00:00', 0, '2026-04-16 07:13:47', '2026-04-16 07:13:47'],
]

for (const d of defects) insertDefect.run(...d as Parameters<typeof insertDefect.run>)

// Defect logs for DEF-2024-001
const insertLog = db.prepare(`
  INSERT INTO defect_logs (id, defect_id, log_type, title, content, cost_amount, occurred_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`)
const logs = [
  [1, 1, 'occurrence',  '최초 누수 발생 신고',    '지하1층 주차장 A구역 천장 누수 신고 접수', null,   '2024-03-15 09:00:00'],
  [2, 1, 'inspection',  '국보디자인 현장 방문',    '현장 점검 및 누수 원인 분석 완료',         null,   '2024-04-02 14:00:00'],
  [3, 1, 'action',      '방수 공사 1차 시공',      '우레탄 방수 도포 1차 시공 완료',           650000, '2024-05-10 10:00:00'],
  [4, 1, 'recurrence',  '누수 재발 확인',          '우천 시 동일 구역 재누수 확인',             null,   '2024-07-25 09:00:00'],
  [5, 1, 'action',      '방수 공사 2차 보강',      '크랙 부위 실링 + 방수 보강 완료',          200000, '2024-08-15 11:00:00'],
]
for (const l of logs) insertLog.run(...l as Parameters<typeof insertLog.run>)

// Additional logs for other defects
const moreLogs = [
  [6, 2, 'occurrence', '분전반 이상 소음 신고',    null, null, '2024-04-10 11:00:00'],
  [7, 2, 'inspection', '삼성전기서비스 점검',       '차단기 노후화 확인', null, '2024-05-15 10:00:00'],
  [8, 2, 'action',     '차단기 교체 완료',          null, 1200000, '2024-09-05 16:00:00'],
  [9, 3, 'occurrence', '에어컨 냉방 불량 신고',     null, null, '2024-06-01 10:00:00'],
  [10,3, 'inspection', '쾌적공조 점검',             '냉매 부족 확인', null, '2024-06-20 14:00:00'],
  [11,3, 'action',     '냉매 충전 완료',            null, 120000, '2024-06-25 10:00:00'],
  [12,3, 'recurrence', '냉방 불량 재발',            null, null, '2024-08-15 09:00:00'],
  [13,4, 'occurrence', '바닥 균열 신고',            null, null, '2024-07-20 13:00:00'],
  [14,4, 'action',     '균열 보수 완료 (claim)',    null, 0, '2024-08-01 11:00:00'],
  [15,5, 'occurrence', '배관 조인트 누수 신고',     null, null, '2025-01-10 08:00:00'],
  [16,5, 'inspection', '한국설비 현장 점검',        null, null, '2025-01-15 14:00:00'],
]
for (const l of moreLogs) insertLog.run(...l as Parameters<typeof insertLog.run>)

console.log('✅ 시드 데이터 삽입 완료')
console.log(`   건물: 1, 도면: 5, 카테고리: 4, 협력업체: 4, 하자: 5, 이력: ${logs.length + moreLogs.length}`)

db.close()
