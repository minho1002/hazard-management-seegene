'use client'

import { useState } from 'react'
import { useStore, type PhotoType, type DefectFile } from '@/lib/store'
import { compressImage } from '@/lib/imageCompress'

interface Props {
  defectId: number
  uploadedBy: string | null
}

const PHOTO_TYPE_LABELS: Record<PhotoType, string> = {
  before: '조치전 사진',
  during: '조치중 사진',
  after: '조치후 사진',
  quote: '견적서',
  work_confirmation: '작업확인서',
  inspection_sheet: '점검표',
  contract: '계약 관련 파일',
  vendor_opinion: '시공사/외주업체 의견서',
  other: '기타',
}
const SECTIONS: { type: PhotoType; icon: string }[] = [
  { type: 'before', icon: 'fa-camera' },
  { type: 'during', icon: 'fa-person-digging' },
  { type: 'after', icon: 'fa-check-double' },
  { type: 'quote', icon: 'fa-file-invoice-dollar' },
  { type: 'work_confirmation', icon: 'fa-clipboard-check' },
  { type: 'inspection_sheet', icon: 'fa-list-check' },
  { type: 'contract', icon: 'fa-file-contract' },
  { type: 'vendor_opinion', icon: 'fa-comment-dots' },
  { type: 'other', icon: 'fa-paperclip' },
]
const PHOTO_CATEGORIES: PhotoType[] = ['before', 'during', 'after']
const ALLOWED_EXT: Record<PhotoType, string[]> = {
  before: ['jpg', 'jpeg', 'png'],
  during: ['jpg', 'jpeg', 'png'],
  after: ['jpg', 'jpeg', 'png'],
  quote: ['pdf', 'xlsx', 'docx', 'jpg', 'jpeg', 'png'],
  work_confirmation: ['pdf', 'xlsx', 'docx', 'jpg', 'jpeg', 'png'],
  inspection_sheet: ['pdf', 'xlsx', 'docx', 'jpg', 'jpeg', 'png'],
  contract: ['pdf', 'xlsx', 'docx', 'jpg', 'jpeg', 'png'],
  vendor_opinion: ['pdf', 'xlsx', 'docx', 'jpg', 'jpeg', 'png'],
  other: ['jpg', 'jpeg', 'png', 'pdf', 'xlsx', 'docx'],
}
const MAX_SIZE_BYTES: Record<PhotoType, number> = PHOTO_CATEGORIES.reduce(
  (acc, t) => ({ ...acc, [t]: 15 * 1024 * 1024 }),
  SECTIONS.reduce((acc, s) => ({ ...acc, [s.type]: 5 * 1024 * 1024 }), {} as Record<PhotoType, number>)
)

function getExt(fileName: string): string {
  return fileName.split('.').pop()?.toLowerCase() ?? ''
}

function fmtDT(s: string) {
  const d = new Date(s)
  return d.toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' }) + ' ' + d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
}

export default function DefectPhotos({ defectId, uploadedBy }: Props) {
  const { state, addFile, deleteFile } = useStore()
  const [uploading, setUploading] = useState<PhotoType | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  const files = state.files.filter(f => f.defectId === defectId)
  const latestBefore = [...files].filter(f => f.photoType === 'before').sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())[0]
  const latestAfter = [...files].filter(f => f.photoType === 'after').sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())[0]

  async function upload(e: React.ChangeEvent<HTMLInputElement>, photoType: PhotoType) {
    const selected = e.target.files
    if (!selected || selected.length === 0) return
    setUploading(photoType)
    try {
      for (const file of Array.from(selected)) {
        const ext = getExt(file.name)
        if (!ALLOWED_EXT[photoType].includes(ext)) {
          alert(`"${file.name}"은(는) 허용되지 않는 형식입니다. ${PHOTO_TYPE_LABELS[photoType]}은 ${ALLOWED_EXT[photoType].join(', ')} 형식만 첨부 가능합니다.`)
          continue
        }
        const maxSize = MAX_SIZE_BYTES[photoType]
        if (file.size > maxSize) {
          alert(`"${file.name}"이(가) 너무 큽니다. ${Math.round(maxSize / (1024 * 1024))}MB 이하 파일만 첨부 가능합니다.`)
          continue
        }
        const dataUrl = await compressImage(file)
        addFile({ defectId, photoType, fileName: file.name, fileType: file.type, dataUrl, uploadedBy })
      }
    } finally {
      setUploading(null)
      e.target.value = ''
    }
  }

  function remove(file: DefectFile) {
    const reason = prompt(`"${file.fileName}" 파일을 삭제하는 사유를 입력하세요.`)
    if (reason == null) return
    if (!reason.trim()) { alert('삭제 사유를 입력해야 합니다.'); return }
    deleteFile(file.id, reason.trim(), uploadedBy)
  }

  function download(file: DefectFile) {
    const a = document.createElement('a')
    a.href = file.dataUrl
    a.download = file.fileName
    a.click()
  }

  const card: React.CSSProperties = { background: '#fff', border: '1px solid #e3e8ef', borderRadius: 12, boxShadow: '0 1px 3px rgba(10,37,64,0.06)', overflow: 'hidden', marginTop: 16 }

  return (
    <div style={card}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f4f8', background: '#fafbfc' }}>
        <span style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#697386' }}>
          사진 / 첨부파일
        </span>
      </div>

      {/* 조치전/후 비교 */}
      {latestBefore && latestAfter && (
        <div style={{ padding: '16px 16px 0' }}>
          <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#697386', marginBottom: 8 }}>조치전/후 비교</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {([{ label: '조치전', file: latestBefore }, { label: '조치후', file: latestAfter }] as { label: string; file: DefectFile }[]).map(({ label, file }) => (
              <div key={label} style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid #e3e8ef' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={file.dataUrl} alt={label} style={{ width: '100%', height: 130, objectFit: 'cover', display: 'block' }} />
                <div style={{ fontSize: '0.65rem', color: '#697386', textAlign: 'center', padding: '3px 0', background: '#fafbfc' }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        {SECTIONS.map(({ type, icon }) => {
          const sectionFiles = files.filter(f => f.photoType === type)
          const isUploading = uploading === type
          return (
            <div key={type}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#0a2540', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <i className={`fa-solid ${icon}`} style={{ fontSize: '.7rem', color: '#697386' }} />
                  {PHOTO_TYPE_LABELS[type]} <span style={{ color: '#b0bac6', fontWeight: 400 }}>({sectionFiles.length})</span>
                </span>
                <label style={{
                  cursor: isUploading ? 'not-allowed' : 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  fontSize: '.68rem', color: '#635bff', fontWeight: 600,
                  padding: '4px 9px', border: '1.5px solid #635bff', borderRadius: 6,
                  opacity: isUploading ? 0.6 : 1,
                }}>
                  <i className={`fa-solid ${isUploading ? 'fa-spinner fa-spin' : 'fa-upload'}`} style={{ fontSize: '.6rem' }} />
                  {isUploading ? '업로드 중...' : '업로드'}
                  <input
                    type="file"
                    accept={ALLOWED_EXT[type].map(ext => `.${ext}`).join(',')}
                    multiple
                    style={{ display: 'none' }}
                    disabled={isUploading}
                    onChange={e => upload(e, type)}
                  />
                </label>
              </div>

              {sectionFiles.length === 0 ? (
                <div style={{ fontSize: '.72rem', color: '#b0bac6', padding: '10px 0' }}>첨부된 파일이 없습니다.</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 8 }}>
                  {sectionFiles.map(f => {
                    const isImage = f.fileType.startsWith('image/')
                    return (
                      <div key={f.id} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <div
                          style={{ position: 'relative', width: '100%', aspectRatio: '1 / 1', borderRadius: 8, overflow: 'hidden', border: '1px solid #e3e8ef', background: '#f5f7fa', cursor: 'pointer' }}
                          onClick={() => isImage ? setPreviewUrl(f.dataUrl) : window.open(f.dataUrl, '_blank')}
                        >
                          {isImage ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={f.dataUrl} alt={f.fileName} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                          ) : (
                            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <i className="fa-solid fa-file-lines" style={{ fontSize: '1.4rem', color: '#b0bac6' }} />
                            </div>
                          )}
                          <div style={{ position: 'absolute', top: 3, right: 3, display: 'flex', gap: 3 }}>
                            <button
                              type="button"
                              onClick={e => { e.stopPropagation(); download(f) }}
                              title="다운로드"
                              style={{ width: 20, height: 20, borderRadius: '50%', background: 'rgba(10,37,64,.6)', color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.55rem' }}
                            >
                              <i className="fa-solid fa-download" />
                            </button>
                            <button
                              type="button"
                              onClick={e => { e.stopPropagation(); remove(f) }}
                              title="삭제"
                              style={{ width: 20, height: 20, borderRadius: '50%', background: 'rgba(10,37,64,.6)', color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.6rem' }}
                            >
                              <i className="fa-solid fa-xmark" />
                            </button>
                          </div>
                        </div>
                        <div style={{ fontSize: '.6rem', color: '#b0bac6', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {f.uploadedBy || '-'} · {fmtDT(f.uploadedAt)}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {previewUrl && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(10,37,64,.42)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(2px)' }}
          onClick={() => setPreviewUrl(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewUrl} alt="" style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 10, boxShadow: '0 8px 28px rgba(10,37,64,.3)' }} />
        </div>
      )}
    </div>
  )
}
