'use client';

import { useEffect, useRef } from 'react';
import { Box } from '@mui/material';
import { useColorScheme } from '@mui/material/styles';

// ── Animation tuning (from provided HTML) ────────────────────
const COLS = 90;
const ROWS = 38;
const SPEED = 0.00040;
const DOT_RADIUS = 1.05;
const MAX_ALPHA = 0.6;
const FIELD_TOP = 0.40;

const WAVES = [
  { xFreq: 1.8, yFreq: 2.2, xSpeed: 1.0, ySpeed: 0.7, amp: 0.13 },
  { xFreq: 3.1, yFreq: 1.4, xSpeed: -0.6, ySpeed: 1.2, amp: 0.09 },
  { xFreq: 0.9, yFreq: 3.8, xSpeed: 0.4, ySpeed: -0.5, amp: 0.06 },
  { xFreq: 5.2, yFreq: 0.8, xSpeed: 0.8, ySpeed: 0.3, amp: 0.035 },
];

const TOTAL_AMP_RATIO = WAVES.reduce((s, w) => s + w.amp, 0);

interface GridPoint {
  nx: number;
  ny: number;
  baseX: number;
  baseY: number;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function pointVisibility(nx: number, ny: number): number {
  const leftFade = smoothstep(0, 0.28, nx);
  const topFade = smoothstep(0, 0.45, ny);
  const rightFade = smoothstep(0, 0.025, 1 - nx);
  const diagBias = 0.35 + 0.65 * Math.pow(nx, 0.4) * Math.pow(ny, 0.3);
  return leftFade * topFade * rightFade * diagBias;
}

function buildGrid(W: number, H: number): GridPoint[] {
  const grid: GridPoint[] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const nx = c / (COLS - 1);
      const ny = r / (ROWS - 1);
      const tilt = (1 - nx) * 0.12;
      const baseY = (FIELD_TOP + tilt + ny * (1 - FIELD_TOP - tilt)) * H;
      grid.push({ nx, ny, baseX: nx * W, baseY });
    }
  }
  return grid;
}

interface ParticleWaveBackgroundProps {
  visible: boolean;
}

export default function ParticleWaveBackground({ visible }: ParticleWaveBackgroundProps) {
  const { mode } = useColorScheme();
  const isDark = mode === 'dark';

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const timeRef = useRef(0);
  const gridRef = useRef<GridPoint[]>([]);
  const sizeRef = useRef({ W: 0, H: 0 });
  const visibleRef = useRef(visible);
  const dotColorRef = useRef(isDark ? '210,210,210' : '80,80,80');

  // Keep refs in sync so the draw loop can read them without re-mounting
  visibleRef.current = visible;
  dotColorRef.current = isDark ? '210,210,210' : '80,80,80';

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    function resize() {
      canvas!.width = canvas!.offsetWidth * devicePixelRatio;
      canvas!.height = canvas!.offsetHeight * devicePixelRatio;
      ctx!.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
      sizeRef.current = { W: canvas!.offsetWidth, H: canvas!.offsetHeight };
      gridRef.current = buildGrid(sizeRef.current.W, sizeRef.current.H);
    }

    function draw() {
      if (!visibleRef.current) {
        // Paused — check again on next frame but don't paint
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      const { W, H } = sizeRef.current;
      ctx!.clearRect(0, 0, W, H);
      timeRef.current += SPEED;
      const time = timeRef.current;

      const fieldH = H * (1 - FIELD_TOP);
      const totalAmp = TOTAL_AMP_RATIO * fieldH;

      for (const p of gridRef.current) {
        let disp = 0;
        for (const w of WAVES) {
          disp +=
            Math.sin(p.nx * w.xFreq * Math.PI * 2 + time * w.xSpeed * 5) *
            Math.cos(p.ny * w.yFreq * Math.PI * 2 + time * w.ySpeed * 3) *
            w.amp *
            fieldH;
        }

        const x = p.baseX;
        const y = p.baseY + disp;

        const peakGlow = (disp / totalAmp + 1) * 0.5;
        const vis = pointVisibility(p.nx, p.ny);
        const alpha = vis * MAX_ALPHA * (0.25 + 0.75 * Math.pow(peakGlow, 1.4));

        if (alpha < 0.008) continue;

        const r = DOT_RADIUS * (0.7 + 0.3 * peakGlow);

        ctx!.beginPath();
        ctx!.arc(x, y, r, 0, Math.PI * 2);
        ctx!.fillStyle = `rgba(${dotColorRef.current},${alpha.toFixed(3)})`;
        ctx!.fill();
      }

      rafRef.current = requestAnimationFrame(draw);
    }

    resize();
    window.addEventListener('resize', resize);
    rafRef.current = requestAnimationFrame(draw);

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <Box
      sx={{
        position: 'absolute',
        inset: 0,
        zIndex: 0,
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.8s cubic-bezier(0.4, 0, 0.2, 1)',
        pointerEvents: 'none',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', display: 'block' }}
      />
    </Box>
  );
}
