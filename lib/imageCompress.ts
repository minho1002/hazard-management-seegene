const MAX_DIMENSION = 1280
const JPEG_QUALITY = 0.75

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

/**
 * 이미지 파일을 최대 1280px 폭/높이로 리사이즈하고 JPEG 품질 0.75로 압축해
 * base64 dataURL을 반환한다. 사진 데이터는 localStorage(브라우저별 5~10MB 제한)에
 * 저장되므로 원본 그대로 넣으면 금방 용량 한도에 걸린다. 이미지가 아닌 파일(PDF 등)은
 * 압축 없이 그대로 dataURL로 변환한다.
 */
export async function compressImage(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    return readAsDataURL(file)
  }

  const original = await readAsDataURL(file)
  const img = await loadImage(original)

  let { width, height } = img
  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    const scale = MAX_DIMENSION / Math.max(width, height)
    width = Math.round(width * scale)
    height = Math.round(height * scale)
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return original

  ctx.drawImage(img, 0, 0, width, height)
  return canvas.toDataURL('image/jpeg', JPEG_QUALITY)
}
