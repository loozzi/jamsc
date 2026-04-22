import { useEffect, useRef } from 'react';

export default function ParticlesCanvas() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let particles = [];
    let animationId;

    const COLORS = ['#00f5d4', '#7b2ff7', '#f72585', '#4361ee'];

    function resize() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }

    function createParticle() {
      return {
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        size: Math.random() * 2 + 0.5,
        opacity: Math.random() * 0.5 + 0.1,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
      };
    }

    function init() {
      resize();
      particles = [];
      const count = Math.min(80, Math.floor((canvas.width * canvas.height) / 15000));
      for (let i = 0; i < count; i++) particles.push(createParticle());
    }

    function animate() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.opacity;
        ctx.fill();
      });

      ctx.globalAlpha = 0.05;
      ctx.strokeStyle = '#7b2ff7';
      ctx.lineWidth = 0.5;
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 150) {
            ctx.globalAlpha = 0.05 * (1 - dist / 150);
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      }

      ctx.globalAlpha = 1;
      animationId = requestAnimationFrame(animate);
    }

    init();
    animate();

    const handleResize = () => resize();
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return <canvas ref={canvasRef} id="particles-canvas" />;
}
