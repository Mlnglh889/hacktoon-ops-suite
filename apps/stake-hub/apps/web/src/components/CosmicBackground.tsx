const stars = Array.from({ length: 34 }, (_, i) => {
  const palette = [
    'rgba(192, 193, 255, .72)',
    'rgba(125, 211, 252, .62)',
    'rgba(167, 139, 250, .68)',
    'rgba(255, 255, 255, .58)',
  ][i % 4]

  return {
    id: i,
    top: `${(i * 41 + 9) % 100}%`,
    left: `${(i * 67 + 13) % 100}%`,
    size: i % 7 === 0 ? 2.5 : i % 3 === 0 ? 1.8 : 1.1,
    color: palette,
    delay: `${(i % 10) * 0.7}s`,
    duration: `${5 + (i % 6)}s`,
  }
})

export default function CosmicBackground() {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0" aria-hidden="true">
      {/* Decorative glow only — the base surface belongs to <body> so every
          route shares one identical gradient (no opaque re-paint here). */}
      <div
        className="absolute inset-0"
        style={{
          background: [
            'radial-gradient(ellipse 760px 500px at 72% 20%, rgba(99, 102, 241, .14), transparent 70%)',
            'radial-gradient(ellipse 620px 420px at 18% 48%, rgba(14, 116, 144, .08), transparent 72%)',
          ].join(', '),
        }}
      />

      {/* A single aligned grid is faded gently instead of restarting per section. */}
      <div
        className="absolute inset-0 opacity-[.07]"
        style={{
          backgroundImage: [
            'linear-gradient(rgba(148, 163, 184, .12) 1px, transparent 1px)',
            'linear-gradient(90deg, rgba(148, 163, 184, .12) 1px, transparent 1px)',
          ].join(', '),
          backgroundSize: '72px 72px',
          maskImage: 'linear-gradient(180deg, transparent 0%, black 30%, black 86%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(180deg, transparent 0%, black 30%, black 86%, transparent 100%)',
        }}
      />

      {stars.map((star) => (
        <span
          key={star.id}
          className="absolute rounded-full star-twinkle"
          style={{
            top: star.top,
            left: star.left,
            width: star.size,
            height: star.size,
            backgroundColor: star.color,
            boxShadow: `0 0 ${star.size * 4}px ${star.color}`,
            animationDelay: star.delay,
            animationDuration: star.duration,
          }}
        />
      ))}
    </div>
  )
}
