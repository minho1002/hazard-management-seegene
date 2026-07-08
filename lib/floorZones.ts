// 하자 등록 화면에서 도면 클릭 시 구역/실명 자동 매핑을 위한 좌표 메타데이터.
// lib/floorSvgs.ts의 각 <rect>/<text> 라벨과 동일한 800x500 viewBox 좌표계를 그대로 사용한다.
// 사용자가 업로드한 커스텀 도면 이미지는 이 메타데이터가 없어 자동 매핑이 동작하지 않고
// 수동 라벨 입력으로 자연스럽게 폴백된다.

export interface FloorZone {
  name: string
  x: number
  y: number
  w: number
  h: number
  isZone?: boolean // true면 "구역" 필드에, false/미지정이면 "실명" 필드에 매핑
}

export const FLOOR_ZONES: Record<number, FloorZone[]> = {
  1: [
    { name: '기계실', x: 68, y: 58, w: 205, h: 155 },
    { name: '전기실', x: 308, y: 58, w: 165, h: 155 },
    { name: '보일러실', x: 508, y: 58, w: 222, h: 155 },
    { name: '복도', x: 68, y: 240, w: 662, h: 44 },
    { name: '창고', x: 68, y: 316, w: 305, h: 130 },
    { name: '펌프실', x: 405, y: 316, w: 325, h: 130 },
  ],
  2: [
    { name: '주차장 A구역', x: 68, y: 58, w: 325, h: 315, isZone: true },
    { name: '주차장 B구역', x: 428, y: 58, w: 302, h: 315, isZone: true },
    { name: '통로', x: 68, y: 398, w: 662, h: 52 },
  ],
  3: [
    { name: '로비 (중앙)', x: 68, y: 58, w: 662, h: 175 },
    { name: '안내데스크', x: 288, y: 82, w: 215, h: 62 },
    { name: '복도', x: 68, y: 262, w: 662, h: 40 },
    { name: '회의실 101', x: 68, y: 326, w: 165, h: 125 },
    { name: '사무실 102', x: 262, y: 326, w: 215, h: 125 },
    { name: '화장실', x: 508, y: 326, w: 122, h: 125 },
    { name: '계단', x: 658, y: 326, w: 72, h: 125 },
  ],
  4: [
    { name: '복도', x: 68, y: 58, w: 662, h: 40 },
    { name: '사무실 201', x: 68, y: 120, w: 272, h: 155 },
    { name: '사무실 202', x: 372, y: 120, w: 215, h: 155 },
    { name: '회의실', x: 618, y: 120, w: 112, h: 155 },
    { name: '사무실 204', x: 68, y: 298, w: 272, h: 155 },
    { name: '서버실', x: 372, y: 298, w: 155, h: 155 },
    { name: '화장실/계단', x: 558, y: 298, w: 172, h: 155 },
  ],
  5: [
    { name: '복도', x: 68, y: 58, w: 662, h: 40 },
    { name: '강당 (301)', x: 68, y: 120, w: 392, h: 155 },
    { name: '전기실 (302)', x: 492, y: 120, w: 238, h: 155 },
    { name: '교육실 303', x: 68, y: 298, w: 202, h: 155 },
    { name: '교육실 304', x: 302, y: 298, w: 202, h: 155 },
    { name: '화장실/계단', x: 536, y: 298, w: 194, h: 155 },
  ],
  6: [
    { name: '복도', x: 68, y: 58, w: 662, h: 40 },
    { name: '사무실 401', x: 68, y: 120, w: 272, h: 155 },
    { name: '사무실 402', x: 372, y: 120, w: 215, h: 155 },
    { name: '회의실 403', x: 618, y: 120, w: 112, h: 155 },
    { name: '사무실 404', x: 68, y: 298, w: 202, h: 155 },
    { name: '사무실 405', x: 302, y: 298, w: 265, h: 155 },
    { name: '화장실/계단', x: 598, y: 298, w: 132, h: 155 },
  ],
  7: [
    { name: '복도', x: 68, y: 58, w: 662, h: 40 },
    { name: '대회의실 (501)', x: 68, y: 120, w: 450, h: 160 },
    { name: '소회의실 502', x: 550, y: 120, w: 180, h: 160 },
    { name: '사무실 503', x: 68, y: 308, w: 215, h: 145 },
    { name: '사무실 504', x: 315, y: 308, w: 215, h: 145 },
    { name: '화장실/계단', x: 562, y: 308, w: 168, h: 145 },
  ],
}

// onMapClick()이 산출하는 xPct/yPct(0~100, 컨테이너 기준 %)를 800x500 viewBox 좌표로
// 환산해 어느 구역/실 위에 클릭했는지 찾는다. 매칭 실패 시 null(수동 라벨 입력으로 폴백).
export function findFloorZoneAt(floorPlanId: number, xPct: number, yPct: number): FloorZone | null {
  const zones = FLOOR_ZONES[floorPlanId]
  if (!zones) return null
  const x = (xPct / 100) * 800
  const y = (yPct / 100) * 500
  return zones.find(z => x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h) ?? null
}
