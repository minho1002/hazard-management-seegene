'use client'

import { useState } from 'react'
import { canAccessAdminSettings, canManageUsers, useCurrentRole, type Role } from '@/lib/permissions'
import { usePermissionMatrix } from '@/lib/auth/permissionMatrix'
import { useSession } from '@/lib/auth/session'
import { useUserStore, type NewUserInput } from '@/lib/auth/userStore'
import type { User, AccountStatus } from '@/lib/auth/types'
import AccessDenied from '@/components/ui/AccessDenied'

const ROLE_OPTIONS: Role[] = ['조회자', '실무자', '관리자']
const STATUS_OPTIONS: AccountStatus[] = ['활성', '비활성', '잠금']

const STATUS_COLORS: Record<AccountStatus, { bg: string; text: string }> = {
  '활성': { bg: '#e6f6f0', text: '#0f7850' },
  '비활성': { bg: '#f3f5f7', text: '#697386' },
  '잠금': { bg: '#fef0f4', text: '#be1044' },
  '삭제됨': { bg: '#f3f5f7', text: '#b0bac6' },
}

function emptyNewUser(): NewUserInput {
  return { username: '', password: '', name: '', department: '', position: '', phone: '', email: '', role: '실무자', status: '활성' }
}

function fmtDT(s: string | null) {
  if (!s) return '-'
  const d = new Date(s)
  return d.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }) + ' ' + d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
}

const card: React.CSSProperties = { background: '#fff', border: '1px solid #e3e8ef', borderRadius: 12, boxShadow: '0 1px 3px rgba(10,37,64,0.06)' }
const inputCls: React.CSSProperties = { border: '1px solid #e3e8ef', borderRadius: 7, padding: '8px 12px', fontSize: '0.82rem', fontFamily: 'inherit', color: '#0a2540', background: '#fff', outline: 'none', width: '100%', boxSizing: 'border-box' }
const selectCls: React.CSSProperties = { ...inputCls, appearance: 'none', cursor: 'pointer' }
const labelCls: React.CSSProperties = { fontSize: '0.72rem', fontWeight: 600, color: '#425466', marginBottom: 5, display: 'block' }
const modalOverlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(10,37,64,.42)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(2px)' }
const modalBox: React.CSSProperties = { background: '#fff', borderRadius: 14, padding: 24, width: 460, maxWidth: '94vw', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 8px 28px rgba(10,37,64,.13)', border: '1px solid #e3e8ef' }

export default function UserManagementPage() {
  const role = useCurrentRole()
  usePermissionMatrix() // 권한 매트릭스 변경 시 재렌더 구독
  const session = useSession()
  const { users, ready, createUser, updateUser, deleteUser, resetPassword } = useUserStore()

  const [showRegister, setShowRegister] = useState(false)
  const [newUser, setNewUser] = useState<NewUserInput>(emptyNewUser())
  const [editTarget, setEditTarget] = useState<User | null>(null)
  const [editForm, setEditForm] = useState<{ name: string; department: string; position: string; phone: string; email: string; role: Role; status: AccountStatus }>({ name: '', department: '', position: '', phone: '', email: '', role: '실무자', status: '활성' })
  const [confirmTarget, setConfirmTarget] = useState<{ user: User; action: 'disable' | 'delete' } | null>(null)
  const [confirmReason, setConfirmReason] = useState('')
  const [resetResult, setResetResult] = useState<{ user: User; tempPassword: string } | null>(null)
  const [showDeleted, setShowDeleted] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  if (!canAccessAdminSettings(role)) {
    return <AccessDenied message="사용자 관리는 관리자만 접근할 수 있습니다." />
  }

  const canManage = canManageUsers(role)

  const changedBy = session?.username ?? 'system'
  const visibleUsers = users.filter(u => showDeleted ? true : u.status !== '삭제됨')

  function openEdit(u: User) {
    setEditTarget(u)
    setEditForm({ name: u.name, department: u.department, position: u.position, phone: u.phone, email: u.email, role: u.role, status: u.status })
    setFormError(null)
  }

  async function submitRegister() {
    if (!newUser.username.trim() || !newUser.password.trim() || !newUser.name.trim()) {
      setFormError('아이디, 임시 비밀번호, 이름은 필수입니다.')
      return
    }
    const result = await createUser(newUser, changedBy)
    if (!result.ok) { setFormError(result.error); return }
    setShowRegister(false)
    setNewUser(emptyNewUser())
    setFormError(null)
  }

  function submitEdit() {
    if (!editTarget) return
    const result = updateUser(editTarget.id, editForm, changedBy)
    if (!result.ok) { setFormError(result.error); return }
    setEditTarget(null)
    setFormError(null)
  }

  function submitConfirm() {
    if (!confirmTarget) return
    const { user, action } = confirmTarget
    if (!confirmReason.trim()) { setFormError('사유를 입력하세요.'); return }
    const result = action === 'disable'
      ? updateUser(user.id, { status: '비활성' }, changedBy, confirmReason.trim())
      : deleteUser(user.id, changedBy, session?.userId ?? '', confirmReason.trim())
    if (!result.ok) { setFormError(result.error); return }
    setConfirmTarget(null)
    setConfirmReason('')
    setFormError(null)
  }

  async function handleResetPassword(u: User) {
    if (!confirm(`'${u.name}(${u.username})' 계정의 비밀번호를 초기화하시겠습니까?`)) return
    const result = await resetPassword(u.id, changedBy)
    if (!result.ok) { alert(result.error); return }
    setResetResult({ user: u, tempPassword: result.tempPassword! })
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      <div style={{ padding: '20px 32px 16px', borderBottom: '1px solid #e3e8ef', background: '#fff', position: 'sticky', top: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0a2540' }}>사용자 관리</h1>
          <div style={{ fontSize: '0.72rem', color: '#697386', marginTop: 2 }}>전체 {visibleUsers.length}명</div>
        </div>
        {canManage && (
          <button
            onClick={() => { setShowRegister(true); setFormError(null) }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 7, fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', border: 'none', background: '#635bff', color: '#fff', fontFamily: 'inherit' }}
          >
            <i className="fa-solid fa-user-plus" /> 사용자 등록
          </button>
        )}
      </div>

      <div style={{ padding: '24px 32px' }}>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: '#697386', cursor: 'pointer', marginBottom: 10 }}>
          <input type="checkbox" checked={showDeleted} onChange={e => setShowDeleted(e.target.checked)} />
          삭제된 계정 포함
        </label>

        <div style={{ ...card, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#fafbfc', borderBottom: '1px solid #e3e8ef' }}>
                {['사용자 ID', '이름', '부서', '직책', '역할', '계정 상태', '마지막 로그인', '작업'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '9px 16px', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#697386' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!ready ? (
                <tr><td colSpan={8} style={{ padding: 30, textAlign: 'center', color: '#b0bac6', fontSize: '0.8rem' }}>불러오는 중...</td></tr>
              ) : visibleUsers.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: 30, textAlign: 'center', color: '#b0bac6', fontSize: '0.8rem' }}>등록된 사용자가 없습니다.</td></tr>
              ) : visibleUsers.map(u => {
                const isSelf = u.id === session?.userId
                const sc = STATUS_COLORS[u.status]
                return (
                  <tr key={u.id} style={{ borderBottom: '1px solid #f0f4f8' }}>
                    <td style={{ padding: '11px 16px', fontSize: '0.78rem', fontWeight: 600, color: '#0a2540' }}>
                      {u.username} {isSelf && <span style={{ fontSize: '0.62rem', color: '#635bff', fontWeight: 700, marginLeft: 4 }}>(본인)</span>}
                    </td>
                    <td style={{ padding: '11px 16px', fontSize: '0.8rem', color: '#0a2540' }}>{u.name}</td>
                    <td style={{ padding: '11px 16px', fontSize: '0.78rem', color: '#697386' }}>{u.department}</td>
                    <td style={{ padding: '11px 16px', fontSize: '0.78rem', color: '#697386' }}>{u.position}</td>
                    <td style={{ padding: '11px 16px', fontSize: '0.78rem', color: '#697386' }}>{u.role}</td>
                    <td style={{ padding: '11px 16px' }}>
                      <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 9px', borderRadius: 20, background: sc.bg, color: sc.text }}>{u.status}</span>
                    </td>
                    <td style={{ padding: '11px 16px', fontSize: '0.75rem', color: '#697386' }}>{fmtDT(u.lastLoginAt)}</td>
                    <td style={{ padding: '11px 16px' }}>
                      {u.status === '삭제됨' ? (
                        <span style={{ fontSize: '0.72rem', color: '#b0bac6' }}>-</span>
                      ) : !canManage ? (
                        <span style={{ fontSize: '0.72rem', color: '#b0bac6' }}>조회만 가능</span>
                      ) : (
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const }}>
                          <button onClick={() => openEdit(u)} style={{ fontSize: '0.7rem', padding: '4px 8px', borderRadius: 6, border: '1px solid #e3e8ef', background: '#fff', color: '#425466', cursor: 'pointer' }}>수정</button>
                          <button onClick={() => handleResetPassword(u)} style={{ fontSize: '0.7rem', padding: '4px 8px', borderRadius: 6, border: '1px solid #e3e8ef', background: '#fff', color: '#425466', cursor: 'pointer' }}>비밀번호 초기화</button>
                          {u.status !== '비활성' && (
                            <button onClick={() => { setConfirmTarget({ user: u, action: 'disable' }); setConfirmReason(''); setFormError(null) }} style={{ fontSize: '0.7rem', padding: '4px 8px', borderRadius: 6, border: '1px solid #fde68a', background: '#fffbeb', color: '#b45309', cursor: 'pointer' }}>비활성화</button>
                          )}
                          <button
                            onClick={() => { setConfirmTarget({ user: u, action: 'delete' }); setConfirmReason(''); setFormError(null) }}
                            disabled={isSelf}
                            title={isSelf ? '본인 계정은 삭제할 수 없습니다.' : undefined}
                            style={{ fontSize: '0.7rem', padding: '4px 8px', borderRadius: 6, border: '1px solid #fecdd3', background: isSelf ? '#f3f5f7' : '#fef0f4', color: isSelf ? '#b0bac6' : '#be1044', cursor: isSelf ? 'not-allowed' : 'pointer' }}
                          >삭제</button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 사용자 등록 모달 */}
      {showRegister && (
        <div style={modalOverlay} onClick={e => { if (e.target === e.currentTarget) setShowRegister(false) }}>
          <div style={modalBox}>
            <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0a2540', marginBottom: 16 }}>사용자 등록</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={labelCls}>사용자 ID *</label>
                <input style={inputCls} value={newUser.username} onChange={e => setNewUser(f => ({ ...f, username: e.target.value }))} placeholder="예: hong.gd" />
              </div>
              <div>
                <label style={labelCls}>임시 비밀번호 *</label>
                <input style={inputCls} type="text" value={newUser.password} onChange={e => setNewUser(f => ({ ...f, password: e.target.value }))} placeholder="최초 로그인 시 사용할 임시 비밀번호" />
              </div>
              <div>
                <label style={labelCls}>이름 *</label>
                <input style={inputCls} value={newUser.name} onChange={e => setNewUser(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={labelCls}>부서</label>
                  <input style={inputCls} value={newUser.department} onChange={e => setNewUser(f => ({ ...f, department: e.target.value }))} placeholder="예: 시설관리팀" />
                </div>
                <div>
                  <label style={labelCls}>직책</label>
                  <input style={inputCls} value={newUser.position} onChange={e => setNewUser(f => ({ ...f, position: e.target.value }))} placeholder="예: 대리" />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={labelCls}>연락처</label>
                  <input style={inputCls} value={newUser.phone} onChange={e => setNewUser(f => ({ ...f, phone: e.target.value }))} placeholder="010-0000-0000" />
                </div>
                <div>
                  <label style={labelCls}>이메일</label>
                  <input style={inputCls} value={newUser.email} onChange={e => setNewUser(f => ({ ...f, email: e.target.value }))} placeholder="name@example.com" />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={labelCls}>역할</label>
                  <select style={selectCls} value={newUser.role} onChange={e => setNewUser(f => ({ ...f, role: e.target.value as Role }))}>
                    {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelCls}>계정 상태</label>
                  <select style={selectCls} value={newUser.status} onChange={e => setNewUser(f => ({ ...f, status: e.target.value as AccountStatus }))}>
                    {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              {formError && <div style={{ fontSize: '0.75rem', color: '#be1044' }}>{formError}</div>}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 18, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowRegister(false)} style={{ padding: '8px 16px', borderRadius: 7, fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', border: '1.5px solid #e3e8ef', background: '#fff', color: '#425466', fontFamily: 'inherit' }}>취소</button>
              <button onClick={submitRegister} style={{ padding: '8px 16px', borderRadius: 7, fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', border: '1.5px solid #635bff', background: '#635bff', color: '#fff', fontFamily: 'inherit' }}>등록</button>
            </div>
          </div>
        </div>
      )}

      {/* 사용자 수정 모달 */}
      {editTarget && (
        <div style={modalOverlay} onClick={e => { if (e.target === e.currentTarget) setEditTarget(null) }}>
          <div style={modalBox}>
            <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0a2540', marginBottom: 4 }}>사용자 수정</div>
            <div style={{ fontSize: '0.75rem', color: '#697386', marginBottom: 16 }}>{editTarget.username}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={labelCls}>이름</label>
                <input style={inputCls} value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={labelCls}>부서</label>
                  <input style={inputCls} value={editForm.department} onChange={e => setEditForm(f => ({ ...f, department: e.target.value }))} />
                </div>
                <div>
                  <label style={labelCls}>직책</label>
                  <input style={inputCls} value={editForm.position} onChange={e => setEditForm(f => ({ ...f, position: e.target.value }))} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={labelCls}>연락처</label>
                  <input style={inputCls} value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} />
                </div>
                <div>
                  <label style={labelCls}>이메일</label>
                  <input style={inputCls} value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={labelCls}>역할</label>
                  <select style={selectCls} value={editForm.role} onChange={e => setEditForm(f => ({ ...f, role: e.target.value as Role }))}>
                    {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelCls}>계정 상태</label>
                  <select style={selectCls} value={editForm.status} onChange={e => setEditForm(f => ({ ...f, status: e.target.value as AccountStatus }))}>
                    {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              {formError && <div style={{ fontSize: '0.75rem', color: '#be1044' }}>{formError}</div>}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 18, justifyContent: 'flex-end' }}>
              <button onClick={() => setEditTarget(null)} style={{ padding: '8px 16px', borderRadius: 7, fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', border: '1.5px solid #e3e8ef', background: '#fff', color: '#425466', fontFamily: 'inherit' }}>취소</button>
              <button onClick={submitEdit} style={{ padding: '8px 16px', borderRadius: 7, fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', border: '1.5px solid #635bff', background: '#635bff', color: '#fff', fontFamily: 'inherit' }}>저장</button>
            </div>
          </div>
        </div>
      )}

      {/* 비활성화/삭제 확인 모달 */}
      {confirmTarget && (
        <div style={modalOverlay} onClick={e => { if (e.target === e.currentTarget) setConfirmTarget(null) }}>
          <div style={{ ...modalBox, width: 400 }}>
            <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0a2540', marginBottom: 4 }}>
              {confirmTarget.action === 'disable' ? '계정 비활성화' : '계정 삭제'}
            </div>
            <div style={{ fontSize: '0.78rem', color: '#697386', marginBottom: 14 }}>
              '{confirmTarget.user.name}({confirmTarget.user.username})' 계정을 {confirmTarget.action === 'disable' ? '비활성화' : '삭제'}하시겠습니까?
            </div>
            <label style={labelCls}>사유 *</label>
            <textarea style={{ ...inputCls, resize: 'vertical' }} rows={2} value={confirmReason} onChange={e => setConfirmReason(e.target.value)} placeholder="사유를 입력하세요." />
            {formError && <div style={{ fontSize: '0.75rem', color: '#be1044', marginTop: 8 }}>{formError}</div>}
            <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
              <button onClick={() => setConfirmTarget(null)} style={{ padding: '8px 16px', borderRadius: 7, fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', border: '1.5px solid #e3e8ef', background: '#fff', color: '#425466', fontFamily: 'inherit' }}>취소</button>
              <button onClick={submitConfirm} style={{ padding: '8px 16px', borderRadius: 7, fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', border: '1.5px solid #DC2626', background: '#DC2626', color: '#fff', fontFamily: 'inherit' }}>
                {confirmTarget.action === 'disable' ? '비활성화' : '삭제'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 비밀번호 초기화 결과 모달 */}
      {resetResult && (
        <div style={modalOverlay} onClick={e => { if (e.target === e.currentTarget) setResetResult(null) }}>
          <div style={{ ...modalBox, width: 400 }}>
            <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0a2540', marginBottom: 4 }}>비밀번호가 초기화되었습니다</div>
            <div style={{ fontSize: '0.78rem', color: '#697386', marginBottom: 14 }}>{resetResult.user.name}({resetResult.user.username})님에게 아래 임시 비밀번호를 전달하세요. 이 화면을 닫으면 다시 확인할 수 없습니다.</div>
            <div style={{ padding: '12px 14px', background: '#fafbfc', border: '1px solid #e3e8ef', borderRadius: 8, fontFamily: "'SF Mono','Fira Code',monospace", fontSize: '1rem', fontWeight: 700, color: '#0a2540', textAlign: 'center', letterSpacing: '0.05em' }}>
              {resetResult.tempPassword}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
              <button onClick={() => setResetResult(null)} style={{ padding: '8px 16px', borderRadius: 7, fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', border: '1.5px solid #635bff', background: '#635bff', color: '#fff', fontFamily: 'inherit' }}>확인</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
