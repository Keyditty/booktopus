import { useState } from 'react'
import { hashStr } from '../lib/normalize'

const PALETTE = [['#1d5a6e', '#e8f7f5'], ['#4a2f7a', '#f1e8ff'], ['#7a2f4f', '#ffe8ef'], ['#17695a', '#e6fff6'], ['#2c3e8c', '#e8eeff'], ['#8a4b1f', '#fff0dc'], ['#1f4d3a', '#e6ffe9'], ['#5a2a6e', '#f6e8ff']]

export function Cover({ title, author, url, className = '' }: { title: string; author?: string; url?: string; className?: string }) {
  const [failed, setFailed] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [bg, fg] = PALETTE[parseInt(hashStr(title), 36) % PALETTE.length]
  const showImg = url && !failed
  return (
    <div className={`cover spine relative aspect-[2/3] w-full overflow-hidden ${className}`} style={{ background: bg }}>
      {(!showImg || !loaded) && (
        <div className="absolute inset-0 flex flex-col items-center justify-between p-3 text-center" style={{ color: fg }} aria-hidden={!!showImg}>
          <div className="mt-2 h-px w-10 opacity-60" style={{ background: fg }} />
          <div className="serif text-[clamp(0.8rem,2.6vw,1.05rem)] font-semibold leading-tight line-clamp-5">{title}</div>
          <div className="text-[0.65rem] uppercase tracking-widest opacity-80 line-clamp-2">{author}</div>
        </div>
      )}
      {showImg && (
        <img src={url} alt={`Cover of ${title}`} loading="lazy" referrerPolicy="no-referrer"
          onLoad={(e) => { const im = e.currentTarget; if (im.naturalWidth < 20) setFailed(true); else setLoaded(true) }}
          onError={() => setFailed(true)}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`} />
      )}
    </div>
  )
}
