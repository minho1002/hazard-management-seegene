export type Severity = 'low' | 'medium' | 'high' | 'critical'
export type Status = 'open' | 'in_progress' | 'completed'
export type CostType = 'gukbo' | 'our' | 'claim'
export type LogType = 'occurrence' | 'inspection' | 'action' | 'recurrence'

export interface Building {
  id: number
  name: string
  address: string | null
  createdAt: string | null
}

export interface FloorPlan {
  id: number
  buildingId: number
  name: string
  imagePath: string | null
  displayOrder: number | null
}

export interface DefectCategory {
  id: number
  name: string
  color: string
  icon: string
}

export interface Vendor {
  id: number
  name: string
  contactPerson: string | null
  phone: string | null
  specialty: string | null
}

export interface Defect {
  id: number
  caseNumber: string
  title: string
  description: string | null
  buildingId: number | null
  floorPlanId: number | null
  locationX: number | null
  locationY: number | null
  locationText: string | null
  categoryId: number | null
  severity: Severity
  status: Status
  costType: CostType
  reporterName: string | null
  reporterPhone: string | null
  assignedVendorId: number | null
  managerName: string | null
  recurrenceCount: number | null
  firstOccurredAt: string | null
  lastOccurredAt: string | null
  totalCost: number | null
  createdAt: string | null
  updatedAt: string | null
  // joined
  categoryName?: string
  categoryColor?: string
  categoryIcon?: string
  vendorName?: string
  buildingName?: string
  floorPlanName?: string
  fileCount?: number
}

export interface DefectLog {
  id: number
  defectId: number
  logType: LogType
  title: string
  content: string | null
  costAmount: number | null
  occurredAt: string
  createdAt: string | null
}

export interface DefectFile {
  id: number
  defectId: number
  filePath: string
  fileType: string | null
  originalName: string | null
  uploadedAt: string | null
}

export interface DashboardStats {
  total: number
  open: number
  inProgress: number
  completed: number
  thisMonth: number
  bySeverity: { severity: Severity; count: number }[]
  byCategory: { name: string; color: string; count: number }[]
  monthlyCounts: { month: string; count: number }[]
  costByVendor: { vendor: string; cost: number }[]
}
