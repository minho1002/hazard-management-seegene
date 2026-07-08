'use client'

import { canAccessAdminSettings, useCurrentRole } from '@/lib/permissions'
import AccessDenied from '@/components/ui/AccessDenied'

const CAPABILITIES: { label: string; viewer: string; worker: string; admin: string }[] = [
  { label: '대시보드 · 하자목록 · 하자상세 · 집계현황 · 보고서 조회', viewer: 'O', worker: 'O', admin: 'O' },
  { label: '하자 등록', viewer: '-', worker: 'O', admin: 'O' },
  { label: '하자 수정', viewer: '-', worker: '본인/담당 건만', admin: '전체' },
  { label: '사진 · 첨부파일 업로드', viewer: '-', worker: '본인/담당 건만', admin: '전체' },
  { label: '진행상태 변경 · 조치완료 요청', viewer: '-', worker: '본인/담당 건만', admin: '전체' },
  { label: '하자구분 · 비용부담 의견 입력', viewer: '-', worker: 'O (의견만)', admin: 'O (최종 확정)' },
  { label: '하자 삭제(Soft Delete)', viewer: '-', worker: '-', admin: 'O' },
  { label: '최종완료 승인', viewer: '-', worker: '-', admin: 'O' },
  { label: '반복 하자 확정 · 해제', viewer: '-', worker: '-', admin: 'O' },
  { label: '비용 부담 주체 · 비용 승인 확정', viewer: '-', worker: '-', admin: 'O' },
  { label: '보고서 최종 승인', viewer: '-', worker: '-', admin: 'O' },
  { label: '감사이력(하자) 조회', viewer: '-', worker: '-', admin: 'O' },
  { label: '사용자 계정 생성 · 수정 · 삭제 · 비밀번호 초기화', viewer: '-', worker: '-', admin: 'O' },
  { label: '로그인 이력 · 계정 변경 이력 조회', viewer: '-', worker: '-', admin: 'O' },
]

const card: React.CSSProperties = { background: '#fff', border: '1px solid #e3e8ef', borderRadius: 12, boxShadow: '0 1px 3px rgba(10,37,64,0.06)', overflow: 'hidden' }

function Cell({ value }: { value: string }) {
  if (value === 'O') return <span style={{ color: '#0f7850', fontWeight: 700 }}><i className="fa-solid fa-circle-check" /></span>
  if (value === '-') return <span style={{ color: '#d1d5db' }}><i className="fa-solid fa-minus" /></span>
  return <span style={{ color: '#425466', fontSize: '0.75rem' }}>{value}</span>
}

export default function PermissionsPage() {
  const role = useCurrentRole()
  if (!canAccessAdminSettings(role)) {
    return <AccessDenied message="권한 관리는 관리자만 접근할 수 있습니다." />
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      <div style={{ padding: '20px 32px 16px', borderBottom: '1px solid #e3e8ef', background: '#fff', position: 'sticky', top: 0, zIndex: 50 }}>
        <h1 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0a2540' }}>권한 관리</h1>
        <div style={{ fontSize: '0.72rem', color: '#697386', marginTop: 2 }}>역할별 기능 접근 권한 참조표 (현재는 3역할 고정 구조 — 역할별 개별 커스터마이징 기능은 추후 확장 예정)</div>
      </div>
      <div style={{ padding: '24px 32px' }}>
        <div style={{ ...card, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#fafbfc', borderBottom: '1px solid #e3e8ef' }}>
                <th style={{ textAlign: 'left', padding: '9px 16px', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#697386' }}>기능</th>
                <th style={{ textAlign: 'center', padding: '9px 16px', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#697386', width: 140 }}>조회자</th>
                <th style={{ textAlign: 'center', padding: '9px 16px', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#697386', width: 140 }}>실무자</th>
                <th style={{ textAlign: 'center', padding: '9px 16px', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#697386', width: 140 }}>관리자</th>
              </tr>
            </thead>
            <tbody>
              {CAPABILITIES.map(c => (
                <tr key={c.label} style={{ borderBottom: '1px solid #f0f4f8' }}>
                  <td style={{ padding: '11px 16px', fontSize: '0.8rem', color: '#0a2540' }}>{c.label}</td>
                  <td style={{ padding: '11px 16px', textAlign: 'center' }}><Cell value={c.viewer} /></td>
                  <td style={{ padding: '11px 16px', textAlign: 'center' }}><Cell value={c.worker} /></td>
                  <td style={{ padding: '11px 16px', textAlign: 'center' }}><Cell value={c.admin} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
