// pdfjs-dist(legacy build, pdf-parse가 내부적으로 사용)는 렌더링 관련 모듈 최상위에서
// `new DOMMatrix()`를 실행한다 — 실제로는 텍스트 추출 시 호출되지 않는 코드 경로지만,
// import 시점에 무조건 평가되어 브라우저 DOM이 없는 서버(특히 Vercel의 서버리스 런타임 —
// 로컬에는 optional dependency `@napi-rs/canvas`의 win32 바이너리가 설치돼 있어 재현되지
// 않았다)에서 "ReferenceError: DOMMatrix is not defined"로 즉시 크래시한다.
// 텍스트/표 추출에는 실제 좌표 변환 기능이 필요 없으므로, 존재만 하는 최소 스텁으로
// 폴리필한다 — 이 파일은 pdf-parse를 import하는 코드보다 먼저 import되어야 한다.
if (typeof (globalThis as any).DOMMatrix === 'undefined') {
  (globalThis as any).DOMMatrix = class DOMMatrix {}
}
