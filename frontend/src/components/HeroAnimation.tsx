import { useEffect, useRef } from "react";

// Pure CSS animated hero visual — audio waveform + AI processing nodes
// No external dependencies, fully self-contained

export default function HeroAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId: number;
    const dpr = window.devicePixelRatio || 1;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    // ── Particles ──────────────────────────────────────
    const particles: {
      x: number;
      y: number;
      vx: number;
      vy: number;
      r: number;
      alpha: number;
      da: number;
      hue: number;
    }[] = [];

    const W = () => canvas.width / dpr;
    const H = () => canvas.height / dpr;

    for (let i = 0; i < 40; i++) {
      particles.push({
        x: Math.random() * W(),
        y: Math.random() * H(),
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        r: Math.random() * 2 + 0.8,
        alpha: Math.random() * 0.5 + 0.1,
        da: (Math.random() - 0.5) * 0.008,
        hue: Math.random() < 0.5 ? 250 + Math.random() * 30 : 270 + Math.random() * 40,
      });
    }

    // ── Connection nodes (representing AI processing) ──
    const nodes: { x: number; y: number; r: number; phase: number; speed: number }[] = [];
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2 - Math.PI / 2;
      const radius = Math.min(W(), H()) * 0.18;
      nodes.push({
        x: 0, y: 0, r: 4 + Math.random() * 4,
        phase: angle,
        speed: 0.15 + Math.random() * 0.2,
      });
    }
    const centerNode = { x: 0, y: 0, r: 16 };

    // ── Audio Bars ─────────────────────────────────────
    const bars = 24;
    const barData: { target: number; current: number }[] = [];
    for (let i = 0; i < bars; i++) {
      barData.push({ target: 8, current: 8 });
    }

    let time = 0;

    const animate = () => {
      const w = W();
      const h = H();
      const cx = w / 2;
      const cy = h * 0.55;

      ctx.clearRect(0, 0, w, h);

      // ── Draw subtle radial background glow ───────────
      const glowGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(w, h) * 0.35);
      glowGrad.addColorStop(0, "rgba(99, 102, 241, 0.06)");
      glowGrad.addColorStop(0.5, "rgba(168, 85, 247, 0.03)");
      glowGrad.addColorStop(1, "transparent");
      ctx.fillStyle = glowGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, Math.min(w, h) * 0.35, 0, Math.PI * 2);
      ctx.fill();

      // ── Update & draw particles ──────────────────────
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.alpha += p.da;
        if (p.alpha <= 0.05 || p.alpha >= 0.55) p.da *= -1;
        if (p.x < 0) p.x = w;
        if (p.x > w) p.x = 0;
        if (p.y < 0) p.y = h;
        if (p.y > h) p.y = 0;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${p.hue}, 80%, 65%, ${p.alpha})`;
        ctx.fill();
      }

      // ── Update & draw orbiting nodes ──────────────────
      const orbitR = Math.min(w, h) * 0.2;
      const nodePositions: { x: number; y: number; r: number }[] = [];

      for (const n of nodes) {
        n.phase += n.speed * 0.008;
        n.x = cx + Math.cos(n.phase) * orbitR;
        n.y = cy + Math.sin(n.phase) * orbitR;
        nodePositions.push({ x: n.x, y: n.y, r: n.r });
      }
      centerNode.x = cx;
      centerNode.y = cy;

      // ── Draw connections between nodes ────────────────
      for (let i = 0; i < nodePositions.length; i++) {
        const a = nodePositions[i];
        // Connect orbiting nodes to center
        const alpha = 0.12 + 0.06 * Math.sin(time * 0.02 + i);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(cx, cy);
        ctx.strokeStyle = `rgba(129, 140, 248, ${alpha})`;
        ctx.lineWidth = 1;
        ctx.stroke();

        // Connect adjacent orbiting nodes
        const next = nodePositions[(i + 1) % nodePositions.length];
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(next.x, next.y);
        ctx.strokeStyle = `rgba(168, 85, 247, ${alpha * 0.6})`;
        ctx.lineWidth = 0.6;
        ctx.stroke();
      }

      // ── Draw center orb with pulse ────────────────────
      const pulse = 1 + 0.12 * Math.sin(time * 0.03);
      const orbGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, centerNode.r * pulse);
      orbGrad.addColorStop(0, "rgba(165, 140, 255, 0.9)");
      orbGrad.addColorStop(0.4, "rgba(99, 102, 241, 0.7)");
      orbGrad.addColorStop(0.7, "rgba(99, 102, 241, 0.2)");
      orbGrad.addColorStop(1, "transparent");
      ctx.beginPath();
      ctx.arc(cx, cy, centerNode.r * pulse, 0, Math.PI * 2);
      ctx.fillStyle = orbGrad;
      ctx.fill();

      // Outer ring
      ctx.beginPath();
      ctx.arc(cx, cy, centerNode.r * pulse * 1.5, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(129, 140, 248, ${0.2 + 0.08 * Math.sin(time * 0.04)})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // ── Draw orbiting nodes ───────────────────────────
      for (const n of nodePositions) {
        const nodeGrad = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r);
        nodeGrad.addColorStop(0, "rgba(168, 85, 247, 0.9)");
        nodeGrad.addColorStop(1, "rgba(99, 102, 241, 0.1)");
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fillStyle = nodeGrad;
        ctx.fill();
        ctx.strokeStyle = "rgba(168, 85, 247, 0.5)";
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // ── Audio waveform bars ────────────────────────────
      const waveY = cy + orbitR + 40;
      const barWidth = w * 0.035;
      const barGap = w * 0.006;
      const totalWidth = bars * barWidth + (bars - 1) * barGap;
      const startX = cx - totalWidth / 2;

      // Update bar targets with "audio-like" pattern
      for (let i = 0; i < bars; i++) {
        const base = 8;
        const beat = Math.sin(time * 0.05 + i * 0.4) * 16;
        const beat2 = Math.sin(time * 0.07 + i * 0.55 + 1.3) * 10;
        const beat3 = Math.cos(time * 0.045 + i * 0.3) * 12;
        barData[i].target = Math.max(4, base + beat + beat2 + beat3);
        barData[i].current += (barData[i].target - barData[i].current) * 0.12;
      }

      for (let i = 0; i < bars; i++) {
        const barH = barData[i].current;
        const x = startX + i * (barWidth + barGap);
        const y = waveY - barH / 2;

        // Mirror: draw both top and bottom
        const gradTop = ctx.createLinearGradient(x, y, x, waveY);
        gradTop.addColorStop(0, "rgba(99, 102, 241, 0.5)");
        gradTop.addColorStop(1, "rgba(99, 102, 241, 0.05)");
        ctx.fillStyle = gradTop;
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barH, [barWidth / 2, barWidth / 2, 0, 0]);
        ctx.fill();

        const gradBot = ctx.createLinearGradient(x, waveY, x, waveY + barH);
        gradBot.addColorStop(0, "rgba(168, 85, 247, 0.5)");
        gradBot.addColorStop(1, "rgba(168, 85, 247, 0.05)");
        ctx.fillStyle = gradBot;
        ctx.beginPath();
        ctx.roundRect(x, waveY, barWidth, barH, [0, 0, barWidth / 2, barWidth / 2]);
        ctx.fill();
      }

      // ── Floating data packets on connections ───────────
      for (let i = 0; i < nodePositions.length; i++) {
        const t = (time * 0.015 + i * 0.7) % 1;
        const nx = cx + (nodePositions[i].x - cx) * t;
        const ny = cy + (nodePositions[i].y - cy) * t;
        ctx.beginPath();
        ctx.arc(nx, ny, 2, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
        ctx.fill();
      }

      time++;
      animationId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: "100%",
        height: "100%",
        minHeight: 360,
      }}
    />
  );
}