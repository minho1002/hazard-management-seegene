'use client'

import { useState } from 'react'
import { useStore, type PhotoType } from '@/lib/store'
import { compressImage } from '@/lib/imageCompress'

interface Props {
  defectId: number
}

const PHOTO_TYPE_LABELS: Record<PhotoType, string> = { before: '조치전', after: '조치후', other: '기타' }
const SECTIONS: { type: PhotoType; icon: string }[] = [
  { type: 'before', icon: 'fa-camera' },
  { type: 'after', icon: 'fa-check-double' },
  { type: 'other', icon: 'fa-paperclip' },
]

export default function DefectPhotos({ defectId }: Props) {
  const { state, addFile, deleteFile } = useStore()
  const [uploading, setUploading] = useState<PhotoType | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  const files = state.files.filter(f => f.defectId === defectId)

  async function upload(e: React.ChangeEvent<HTMLInputElement>, photoType: PhotoType) {
    const selected = e.target.files
    if (!selected || selected.length === 0) return
    setUploading(photoType)
    try {
      for (const file of Array.from(selected)) {
        if (file.size > 15 * 1024 * 1024) {
          alert(`"${file.name}"이(가) 너무 큽니다. 15MB 이하 파일만 첨부 가능합니다.`)
          continue
        }
        const dataUrl = await compressImage(file)
        addFile({ defectId, photoType, fileName: file.name, fileType: file.type, dataUrl })
      }
    } finally {
      setUploading(null)
      e.target.value = ''
    }
  }

  function remove(fileId: number) {
    if (!confirm('이 파일을 삭제하시겠습니까?')) return
    deleteFile(fileId)
  }

  const card: React.CSSProperties = { background: '#fff', border: '1px solid #e3e8ef', borderRadius: 12, boxShadow: '0 1px 3px rgba(10,37,64,0.06)', overflow: 'hidden', marginTop: 16 }

  return (
    <div style={card}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f4f8', background: '#fafbfc' }}>
        <span style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#697386' }}>
          사진 / 첨부파일
        </span>
      </div>

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
                    accept="image/*,application/pdf"
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
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))', gap: 8 }}>
                  {sectionFiles.map(f => {
                    const isImage = f.fileType.startsWith('image/')
                    return (
                      <div
                        key={f.id}
                        style={{ position: 'relative', width: '100%', aspectRatio: '1 / 1', borderRadius: 8, overflow: 'hidden', border: '1px solid #e3e8ef', background: '#f5f7fa', cursor: 'pointer' }}
                        onClick={() => isImage ? setPreviewUrl(f.dataUrl) : window.open(f.dataUrl, '_blank')}
                      >
                        {isImage ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={f.dataUrl} alt={f.fileName} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                        ) : (
                          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <i className="fa-solid fa-file-pdf" style={{ fontSize: '1.4rem', color: '#b0bac6' }} />
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); remove(f.id) }}
                          title="삭제"
                          style={{
                            position: 'absolute', top: 3, right: 3,
                            width: 20, height: 20, borderRadius: '50%',
                            background: 'rgba(10,37,64,.6)', color: '#fff',
                            border: 'none', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '.6rem',
                          }}
                        >
                          <i className="fa-solid fa-xmark" />
                        </button>
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
