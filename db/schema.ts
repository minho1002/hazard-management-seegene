import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

export const buildings = sqliteTable('buildings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  address: text('address'),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
})

export const floorPlans = sqliteTable('floor_plans', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  buildingId: integer('building_id').notNull().references(() => buildings.id),
  name: text('name').notNull(),
  imagePath: text('image_path'),
  displayOrder: integer('display_order').default(0),
})

export const defectCategories = sqliteTable('defect_categories', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  color: text('color').notNull(),
  icon: text('icon').notNull(),
})

export const vendors = sqliteTable('vendors', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  contactPerson: text('contact_person'),
  phone: text('phone'),
  specialty: text('specialty'),
})

export const defects = sqliteTable('defects', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  caseNumber: text('case_number').notNull().unique(),
  title: text('title').notNull(),
  description: text('description'),
  buildingId: integer('building_id').references(() => buildings.id),
  floorPlanId: integer('floor_plan_id').references(() => floorPlans.id),
  locationX: real('location_x'),
  locationY: real('location_y'),
  locationText: text('location_text'),
  categoryId: integer('category_id').references(() => defectCategories.id),
  severity: text('severity').notNull().default('medium'), // low|medium|high|critical
  status: text('status').notNull().default('open'),       // open|in_progress|completed
  costType: text('cost_type').notNull().default('our'),   // gukbo|our|claim
  reporterName: text('reporter_name'),
  reporterPhone: text('reporter_phone'),
  assignedVendorId: integer('assigned_vendor_id').references(() => vendors.id),
  managerName: text('manager_name'),
  recurrenceCount: integer('recurrence_count').default(0),
  firstOccurredAt: text('first_occurred_at'),
  lastOccurredAt: text('last_occurred_at'),
  totalCost: integer('total_cost').default(0),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').default(sql`(datetime('now'))`),
})

export const defectLogs = sqliteTable('defect_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  defectId: integer('defect_id').notNull().references(() => defects.id, { onDelete: 'cascade' }),
  logType: text('log_type').notNull(), // occurrence|inspection|action|recurrence
  title: text('title').notNull(),
  content: text('content'),
  costAmount: integer('cost_amount'),
  occurredAt: text('occurred_at').notNull(),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
})

export const defectFiles = sqliteTable('defect_files', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  defectId: integer('defect_id').notNull().references(() => defects.id, { onDelete: 'cascade' }),
  filePath: text('file_path').notNull(),
  fileType: text('file_type'),
  originalName: text('original_name'),
  uploadedAt: text('uploaded_at').default(sql`(datetime('now'))`),
})
