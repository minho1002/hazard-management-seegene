import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'
import path from 'path'

function getDbPath() {
  if (process.env.NODE_ENV === 'production') {
    return '/tmp/data.db'
  }
  return path.join(process.cwd(), 'data.db')
}

function initDb(sqlite: Database.Database) {
  sqlite.pragma('foreign_keys = ON')

  sqlite.exec(`
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

  const buildingCount = (sqlite.prepare('SELECT count(*) as c FROM buildings').get() as { c: number }).c
  if (buildingCount === 0) {
    seedDb(sqlite)
  }
}

function monthsAgo(n: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() - n)
  return d.toISOString().replace('T', ' ').substring(0, 19)
}

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().replace('T', ' ').substring(0, 19)
}

function seedDb(sqlite: Database.Database) {
  sqlite.prepare(`INSERT INTO buildings (id, name, address) VALUES (?, ?, ?)`).run(
    1, '본관', '서울특별시 송파구 올림픽로 300'
  )

  const floors: [number, number, string, string, number][] = [
    [1, 1, '지하2층', '/floor-plans/b2.svg', 1],
    [2, 1, '지하1층', '/floor-plans/b1.svg', 2],
    [3, 1, '1층',     '/floor-plans/f1.svg', 3],
    [4, 1, '2층',     '/floor-plans/f2.svg', 4],
    [5, 1, '3층',     '/floor-plans/f3.svg', 5],
  ]
  const insertFloor = sqlite.prepare(`INSERT INTO floor_plans (id, building_id, name, image_path, display_order) VALUES (?, ?, ?, ?, ?)`)
  for (const f of floors) insertFloor.run(...f)

  const categories: [number, string, string, string][] = [
    [1, '누수', '#3B82F6', 'fa-droplet'],
    [2, '전기', '#F59E0B', 'fa-bolt'],
    [3, 'HVAC', '#10B981', 'fa-wind'],
    [4, '균열', '#EF4444', 'fa-triangle-exclamation'],
  ]
  const insertCat = sqlite.prepare(`INSERT INTO defect_categories (id, name, color, icon) VALUES (?, ?, ?, ?)`)
  for (const c of categories) insertCat.run(...c)

  const vendors: [number, string, string, string, string][] = [
    [1, '국보디자인',     '홍담당', '02-1234-5678', '방수/누수'],
    [2, '한국설비(주)',   '이담당', '02-2345-6789', '기계설비'],
    [3, '삼성전기서비스', '박담당', '02-3456-7890', '전기'],
    [4, '쾌적공조(주)',   '최담당', '02-4567-8901', 'HVAC/공조'],
  ]
  const insertVendor = sqlite.prepare(`INSERT INTO vendors (id, name, contact_person, phone, specialty) VALUES (?, ?, ?, ?, ?)`)
  for (const v of vendors) insertVendor.run(...v)

  // Dates relative to now so dashboard charts always show recent data
  const t11 = monthsAgo(11)
  const t9  = monthsAgo(9)
  const t7  = monthsAgo(7)
  const t4  = monthsAgo(4)
  const t2  = monthsAgo(2)
  const t1  = monthsAgo(1)
  const t3d = daysAgo(3)

  const year = new Date().getFullYear()

  const insertDefect = sqlite.prepare(`
    INSERT INTO defects (id, case_number, title, description, building_id, floor_plan_id,
      location_x, location_y, location_text, category_id, severity, status, cost_type,
      reporter_name, assigned_vendor_id, manager_name, recurrence_count,
      first_occurred_at, last_occurred_at, total_cost, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const defects: unknown[][] = [
    [1, `DEF-${year}-001`, '지하1층 주차장 누수', '주차장 천장에서 물이 새고 있음. 비가 올 때마다 심해짐',
     1, 2, 35.5, 60.2, '지하1층 주차장 A구역', 1, 'high', 'in_progress', 'gukbo',
     '홍길동(시설팀)', 1, '김관리', 2,
     t11, t2, 850000, t11, t2],
    [2, `DEF-${year}-002`, '3층 전기실 분전반 이상', '분전반에서 이상 소음 발생, 주기적 점검 필요',
     1, 5, 70.0, 30.0, '3층 전기실', 2, 'critical', 'completed', 'our',
     '이시설(시설팀)', 3, '김관리', 0,
     t9, t4, 1200000, t9, t4],
    [3, `DEF-${year}-003`, '2층 사무실 에어컨 냉방 불량', '냉방 효율 저하, 여름철 실내 온도 유지 어려움',
     1, 4, 50.0, 50.0, '2층 201호 사무실', 3, 'medium', 'open', 'our',
     '박시설(시설팀)', 4, '김관리', 1,
     t7, t2, 320000, t7, t2],
    [4, `DEF-${year}-004`, '1층 로비 바닥 균열', '로비 대리석 바닥 균열 발생',
     1, 3, 45.0, 75.0, '1층 로비 중앙', 4, 'low', 'completed', 'claim',
     '홍길동(시설팀)', null, '김관리', 0,
     t4, t4, 0, t4, t4],
    [5, `DEF-${year}-005`, '지하2층 기계실 배관 누수', '기계실 급수배관 조인트 누수',
     1, 1, 20.0, 40.0, '지하2층 기계실', 1, 'high', 'in_progress', 'gukbo',
     '이시설(시설팀)', 2, '김관리', 0,
     t2, t1, 0, t2, t1],
    [6, `DEF-${year}-006`, '1층 화장실 타일 들뜸', '화장실 바닥 타일 일부 들뜸 현상 발생',
     1, 3, 55.0, 45.0, '1층 남자화장실', 4, 'medium', 'open', 'our',
     '최시설(시설팀)', null, '김관리', 0,
     t3d, t3d, 0, t3d, t3d],
  ]
  for (const d of defects) insertDefect.run(...d)

  const insertLog = sqlite.prepare(`
    INSERT INTO defect_logs (id, defect_id, log_type, title, content, cost_amount, occurred_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `)
  const logs: unknown[][] = [
    [1,  1, 'occurrence', '최초 누수 발생 신고',   '지하1층 주차장 A구역 천장 누수 신고 접수', null,    t11],
    [2,  1, 'inspection', '국보디자인 현장 방문',   '현장 점검 및 누수 원인 분석 완료',         null,    monthsAgo(10)],
    [3,  1, 'action',     '방수 공사 1차 시공',     '우레탄 방수 도포 1차 시공 완료',           650000,  monthsAgo(8)],
    [4,  1, 'recurrence', '누수 재발 확인',         '우천 시 동일 구역 재누수 확인',             null,    monthsAgo(5)],
    [5,  1, 'action',     '방수 공사 2차 보강',     '크랙 부위 실링 + 방수 보강 완료',          200000,  t2],
    [6,  2, 'occurrence', '분전반 이상 소음 신고',  null,                                        null,    t9],
    [7,  2, 'inspection', '삼성전기서비스 점검',    '차단기 노후화 확인',                        null,    monthsAgo(8)],
    [8,  2, 'action',     '차단기 교체 완료',       null,                                        1200000, t4],
    [9,  3, 'occurrence', '에어컨 냉방 불량 신고',  null,                                        null,    t7],
    [10, 3, 'inspection', '쾌적공조 점검',          '냉매 부족 확인',                            null,    monthsAgo(6)],
    [11, 3, 'action',     '냉매 충전 완료',         null,                                        120000,  monthsAgo(6)],
    [12, 3, 'recurrence', '냉방 불량 재발',         null,                                        null,    t2],
    [13, 4, 'occurrence', '바닥 균열 신고',         null,                                        null,    t4],
    [14, 4, 'action',     '균열 보수 완료 (claim)', null,                                        0,       monthsAgo(3)],
    [15, 5, 'occurrence', '배관 조인트 누수 신고',  null,                                        null,    t2],
    [16, 5, 'inspection', '한국설비 현장 점검',     null,                                        null,    t1],
    [17, 6, 'occurrence', '타일 들뜸 신고 접수',    '1층 남자화장실 타일 들뜸 확인',             null,    t3d],
  ]
  for (const l of logs) insertLog.run(...l)
}

const dbPath = getDbPath()
const sqlite = new Database(dbPath)
initDb(sqlite)

export const db = drizzle(sqlite, { schema })
export type DB = typeof db
