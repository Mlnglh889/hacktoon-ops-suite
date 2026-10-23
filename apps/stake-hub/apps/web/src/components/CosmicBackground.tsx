export default function CosmicBackground() {
  const stars = Array.from({ length: 50 }, (_, i) => {
    const palettes = [
      { c: 'rgba(167,139,250,.9)', g: 'rgba(139,92,246,.7)' },
      { c: 'rgba(96,165,250,.9)', g: 'rgba(59,130,246,.7)' },
      { c: 'rgba(34,211,238,.9)', g: 'rgba(34,211,238,.7)' },
      { c: 'rgba(255,255,255,.85)', g: 'rgba(191,219,254,.5)' },
    ]
    const p = palettes[i % 4]
    const big = i % 9 === 0
    const mid = i % 3 === 0
    const size = big ? 4 : mid ? 2.5 : 1.4
    const inner = big ? 1.5 : mid ? 1 : size
    return {
      id: i,
      shaped: big || mid,
      top: `${(i * 37 + 13) % 100}%`,
      left: `${(i * 61 + 7) % 100}%`,
      size,
      inner,
      delay: `${(i % 12) * 0.5}s`,
      dur: `${4 + (i % 7)}s`,
      color: p.c,
      glow: `0 0 ${inner * 2}px ${p.g}, 0 0 ${inner * 6}px ${p.g.replace('.7', '.25').replace('.5', '.2')}`,
    }
  })

  return (
    <>
            {/* Top black + navy layered gradient (Home only) */}
      <div
        className="fixed inset-x-0 top-0 pointer-events-none z-0"
        style={{
          height: '55vh',
          background:
            'linear-gradient(180deg, #01040d 0%, #020617 35%, #04102b 70%, #071538 100%)',
        }}
      />
      {/* Subtle navy side ambience near top */}
      <div
        className="fixed inset-x-0 top-0 pointer-events-none z-0"
        style={{
          height: '45vh',
          background:
            'radial-gradient(ellipse 700px 320px at 15% 0%, rgba(30, 58, 138, 0.22) 0%, transparent 60%), radial-gradient(ellipse 700px 320px at 85% 0%, rgba(23, 37, 84, 0.25) 0%, transparent 60%), radial-gradient(ellipse 900px 260px at 50% 0%, rgba(12, 28, 74, 0.3) 0%, transparent 65%)',
        }}
      />
            {/* Bottom navy gradient rising from page end */}
      <div
        className="absolute pointer-events-none z-0"
        style={{
          bottom: '0',
          left: '0',
          right: '0',
          height: '100vh',
          background:
            'linear-gradient(180deg, transparent 0%, #04102b 25%, #0a1642 45%, #12265f 70%, #1a2f6e 88%, #1e3a8a 100%)',
        }}
      />
      <div
        className="absolute pointer-events-none z-0"
        style={{
          bottom: '0',
          left: '0',
          right: '0',
          height: '70vh',
          background:
            'radial-gradient(ellipse 900px 480px at 50% 100%, rgba(99,102,241,0.22) 0%, transparent 62%), radial-gradient(ellipse 600px 340px at 12% 80%, rgba(30, 58, 138, 0.3) 0%, transparent 60%), radial-gradient(ellipse 600px 340px at 88% 85%, rgba(37, 73, 128, 0.32) 0%, transparent 60%), radial-gradient(ellipse 500px 300px at 50% 100%, rgba(139,92,246,0.10) 0%, transparent 70%)',
        }}
      />
      {/* Stars */}
      {stars.map((s) =>
        s.shaped ? (
          <div
            key={s.id}
            className="fixed star-twinkle star-drift pointer-events-none z-0"
            style={{
              top: s.top,
              left: s.left,
              width: s.size * 4,
              height: s.size * 4,
              animationDelay: s.delay,
              animationDuration: s.dur,
            }}
          >
            <div style={{
              position: 'absolute', left: '50%', top: 0, bottom: 0,
              width: s.inner, transform: 'translateX(-50%)', borderRadius: '50%',
              background: s.color, boxShadow: s.glow,
            }} />
            <div style={{
              position: 'absolute', top: '50%', left: 0, right: 0,
              height: s.inner, transform: 'translateY(-50%)', borderRadius: '50%',
              background: s.color, boxShadow: s.glow,
            }} />
            <div style={{
              position: 'absolute', left: '50%', top: '50%',
              width: s.size, height: s.size, transform: 'translate(-50%,-50%)',
              borderRadius: '50%', background: '#fff',
              boxShadow: `0 0 ${s.size * 3}px 1px #fff, ${s.glow}`,
            }} />
          </div>
        ) : (
          <div
            key={s.id}
            className="fixed rounded-full star-twinkle star-drift pointer-events-none z-0"
            style={{
              top: s.top,
              left: s.left,
              width: s.size,
              height: s.size,
              backgroundColor: s.color,
              boxShadow: s.glow,
              animationDelay: s.delay,
              animationDuration: s.dur,
            }}
          />
        )
      )}
      {/* Shooting stars */}
      {[0, 1].map((i) => (
        <div
          key={`shoot-${i}`}
          className="fixed star-shoot pointer-events-none z-0"
          style={{
            top: `${12 + i * 30}%`,
            left: `${30 + i * 25}%`,
            width: 70,
            height: 1.5,
            borderRadius: 2,
            background: 'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(191,219,254,.8) 60%, #ffffff 100%)',
            boxShadow: '0 0 6px rgba(191,219,254,.8), 0 0 12px rgba(139,92,246,.5)',
            animationDelay: `${3 + i * 4}s`,
            animationDuration: '11s',
          }}
        />
      ))}
    </>
  )
}
