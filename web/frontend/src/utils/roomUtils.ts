const COLORS = ['#C4956A', '#5A8C6A', '#534AB7', '#D85A30', '#185FA5', '#8C7355'];

export function getUserColor(userId: number): string {
  return COLORS[Math.abs(userId) % COLORS.length];
}

export function getUserInitials(name: string): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  if (parts.length === 1 && parts[0].length > 0) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return '?';
}
