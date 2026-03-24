export function getWordPoints(
  word: string,
  canvas: HTMLCanvasElement,
  fontSize: number,
): Array<{ x: number; y: number }> {
  const offscreenCanvas = document.createElement('canvas');
  offscreenCanvas.width = canvas.width;
  offscreenCanvas.height = canvas.height;

  const ctx = offscreenCanvas.getContext('2d');
  if (!ctx) return [];

  ctx.clearRect(0, 0, offscreenCanvas.width, offscreenCanvas.height);
  ctx.font = `600 ${fontSize}px Georgia, serif`;
  ctx.fillStyle = '#000000';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(word, offscreenCanvas.width / 2, offscreenCanvas.height / 2);

  const imageData = ctx.getImageData(0, 0, offscreenCanvas.width, offscreenCanvas.height);
  const sampleStep = canvas.width <= 160 ? 2 : 3;
  const points: Array<{ x: number; y: number }> = [];

  for (let y = 0; y < offscreenCanvas.height; y += sampleStep) {
    for (let x = 0; x < offscreenCanvas.width; x += sampleStep) {
      const alphaIndex = (y * offscreenCanvas.width + x) * 4 + 3;
      if (imageData.data[alphaIndex] > 60) {
        points.push({ x, y });
      }
    }
  }

  points.sort((a, b) => {
    if (a.x === b.x) return a.y - b.y;
    return a.x - b.x;
  });

  return points;
}
